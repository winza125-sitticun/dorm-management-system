import { signLicenseToken, verifyLicenseToken, type LicenseTokenPayload } from './signing.ts';

export interface D1Result<T = unknown> { results?: T[]; success: boolean; meta?: { changes?: number } }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1DatabaseLike { prepare(sql: string): D1Statement }

export type ControlPlaneEnv = { DB: D1DatabaseLike; LICENSE_SIGNING_PRIVATE_KEY: string };
type Plan = 'basic' | 'standard' | 'pro';
type LicenseRow = { id: string; plan: Plan; status: string; max_activations: number; expires_at: string | null };
type ActivationRow = { id: string; license_id: string; installation_id: string; revoked_at: string | null };

export class LicenseError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}


const GENERIC_INVALID = 'License is invalid or unavailable.';
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_AFTER_SECONDS = 24 * 60 * 60;
const ACTIVATE_RATE_LIMIT = 20;
const ACTIVATE_RATE_WINDOW_MS = 10 * 60 * 1000;

function nowIso(nowMs: number) { return new Date(nowMs).toISOString(); }
function unixSeconds(nowMs: number) { return Math.floor(nowMs / 1000); }
function expirySeconds(row: LicenseRow, nowMs: number) {
  const hardExpiry = row.expires_at ? Math.floor(Date.parse(row.expires_at) / 1000) : Number.MAX_SAFE_INTEGER;
  return Math.min(unixSeconds(nowMs) + TOKEN_TTL_SECONDS, hardExpiry);
}

export async function hashLicenseKey(key: string): Promise<string> {
  const normalized = key.trim().toUpperCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function assertUsableLicense(row: LicenseRow | null, nowMs: number): asserts row is LicenseRow {
  if (!row || row.status !== 'active') throw new LicenseError('LICENSE_INVALID', GENERIC_INVALID, 403);
  if (row.expires_at && Date.parse(row.expires_at) <= nowMs) throw new LicenseError('LICENSE_INVALID', GENERIC_INVALID, 403);
}

async function issueToken(env: ControlPlaneEnv, license: LicenseRow, installationId: string, nowMs: number) {
  const issuedAt = unixSeconds(nowMs);
  const expiresAt = expirySeconds(license, nowMs);
  if (expiresAt <= issuedAt) throw new LicenseError('LICENSE_INVALID', GENERIC_INVALID, 403);
  const payload: LicenseTokenPayload = {
    v: 1,
    licenseId: license.id,
    installationId,
    plan: license.plan,
    status: 'active',
    issuedAt,
    expiresAt,
    refreshAfter: Math.min(issuedAt + REFRESH_AFTER_SECONDS, expiresAt),
  };
  return { token: await signLicenseToken(payload, env.LICENSE_SIGNING_PRIVATE_KEY), payload };
}

export async function activateLicense(env: ControlPlaneEnv, input: {
  licenseKey: string; installationId: string; projectName?: string | null; hostname?: string | null; ipHash?: string | null; userAgentHash?: string | null;
}, nowMs = Date.now()) {
  if (!input.licenseKey || !input.installationId) throw new LicenseError('INVALID_REQUEST', 'licenseKey and installationId are required.');
  if (input.ipHash) {
    const since = nowIso(nowMs - ACTIVATE_RATE_WINDOW_MS);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM license_events WHERE kind = 'activate_attempt' AND ip_hash = ? AND created_at >= ?").bind(input.ipHash, since).first<{ count: number }>();
    if (Number(recent?.count || 0) >= ACTIVATE_RATE_LIMIT) throw new LicenseError('RATE_LIMITED', 'Too many activation attempts.', 429);
  }
  await env.DB.prepare('INSERT INTO license_events (license_id, installation_id, kind, ip_hash, user_agent_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(null, input.installationId, 'activate_attempt', input.ipHash ?? null, input.userAgentHash ?? null, nowIso(nowMs)).run();
  const keyHash = await hashLicenseKey(input.licenseKey);
  const license = await env.DB.prepare('SELECT id, plan, status, max_activations, expires_at FROM licenses WHERE key_hash = ? LIMIT 1').bind(keyHash).first<LicenseRow>();
  assertUsableLicense(license, nowMs);

  const existing = await env.DB.prepare('SELECT id, license_id, installation_id, revoked_at FROM activations WHERE license_id = ? AND installation_id = ? LIMIT 1').bind(license.id, input.installationId).first<ActivationRow>();
  const now = nowIso(nowMs);
  if (existing && !existing.revoked_at) {
    await env.DB.prepare('UPDATE activations SET last_seen_at = ?, project_name = ?, primary_hostname = ? WHERE id = ?')
      .bind(now, input.projectName ?? null, input.hostname ?? null, existing.id).run();
    return { ...(await issueToken(env, license, input.installationId, nowMs)), idempotent: true };
  }

  if (existing?.revoked_at) {
    const reactivated = await env.DB.prepare(`UPDATE activations SET revoked_at = NULL, activated_at = ?, last_seen_at = ?, project_name = ?, primary_hostname = ?
      WHERE id = ? AND (SELECT COUNT(*) FROM activations WHERE license_id = ? AND revoked_at IS NULL) < ?`)
      .bind(now, now, input.projectName ?? null, input.hostname ?? null, existing.id, license.id, license.max_activations).run();
    if ((reactivated.meta?.changes ?? 0) < 1) throw new LicenseError('ACTIVATION_LIMIT_REACHED', 'Activation limit reached.', 409);
    return { ...(await issueToken(env, license, input.installationId, nowMs)), idempotent: false };
  }

  const activationId = `act_${crypto.randomUUID()}`;
  let inserted: D1Result;
  try {
    inserted = await env.DB.prepare(`INSERT INTO activations (id, license_id, installation_id, project_name, primary_hostname, activated_at, last_seen_at, revoked_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, NULL
      WHERE (SELECT COUNT(*) FROM activations WHERE license_id = ? AND revoked_at IS NULL) < ?`)
      .bind(activationId, license.id, input.installationId, input.projectName ?? null, input.hostname ?? null, now, now, license.id, license.max_activations).run();
  } catch {
    const concurrent = await env.DB.prepare('SELECT id, license_id, installation_id, revoked_at FROM activations WHERE license_id = ? AND installation_id = ? LIMIT 1').bind(license.id, input.installationId).first<ActivationRow>();
    if (concurrent && !concurrent.revoked_at) return { ...(await issueToken(env, license, input.installationId, nowMs)), idempotent: true };
    throw new LicenseError('ACTIVATION_LIMIT_REACHED', 'Activation limit reached.', 409);
  }
  if ((inserted.meta?.changes ?? 0) < 1) throw new LicenseError('ACTIVATION_LIMIT_REACHED', 'Activation limit reached.', 409);
  return { ...(await issueToken(env, license, input.installationId, nowMs)), idempotent: false };
}

async function verifiedCurrent(env: ControlPlaneEnv, token: string, installationId: string, nowMs: number) {
  let payload: LicenseTokenPayload;
  try { payload = await verifyLicenseToken(token, env.LICENSE_SIGNING_PRIVATE_KEY); }
  catch { throw new LicenseError('INVALID_TOKEN', 'License token is invalid.', 403); }
  if (payload.installationId !== installationId) throw new LicenseError('INVALID_TOKEN', 'License token is invalid.', 403);
  if (payload.expiresAt <= unixSeconds(nowMs)) throw new LicenseError('INVALID_TOKEN', 'License token is invalid.', 403);
  const license = await env.DB.prepare('SELECT id, plan, status, max_activations, expires_at FROM licenses WHERE id = ? LIMIT 1').bind(payload.licenseId).first<LicenseRow>();
  assertUsableLicense(license, nowMs);
  const activation = await env.DB.prepare('SELECT id, license_id, installation_id, revoked_at FROM activations WHERE license_id = ? AND installation_id = ? LIMIT 1').bind(license.id, installationId).first<ActivationRow>();
  if (!activation || activation.revoked_at) throw new LicenseError('ACTIVATION_REVOKED', 'Activation is no longer active.', 403);
  return { payload, license, activation };
}

export async function refreshLicense(env: ControlPlaneEnv, input: { token: string; installationId: string; projectName?: string | null; hostname?: string | null }, nowMs = Date.now()) {
  if (!input.token || !input.installationId) throw new LicenseError('INVALID_REQUEST', 'token and installationId are required.');
  const current = await verifiedCurrent(env, input.token, input.installationId, nowMs);
  await env.DB.prepare('UPDATE activations SET last_seen_at = ?, project_name = ?, primary_hostname = ? WHERE id = ?')
    .bind(nowIso(nowMs), input.projectName ?? null, input.hostname ?? null, current.activation.id).run();
  return issueToken(env, current.license, input.installationId, nowMs);
}

export async function deactivateLicense(env: ControlPlaneEnv, input: { token: string; installationId: string }, nowMs = Date.now()) {
  if (!input.token || !input.installationId) throw new LicenseError('INVALID_REQUEST', 'token and installationId are required.');
  const current = await verifiedCurrent(env, input.token, input.installationId, nowMs);
  const result = await env.DB.prepare('UPDATE activations SET revoked_at = ?, last_seen_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(nowIso(nowMs), nowIso(nowMs), current.activation.id).run();
  if ((result.meta?.changes ?? 0) < 1) throw new LicenseError('ACTIVATION_REVOKED', 'Activation is no longer active.', 409);
  return { ok: true };
}
