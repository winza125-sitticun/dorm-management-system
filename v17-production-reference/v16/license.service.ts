import type { SubscriptionPlan } from '../../constants/planEntitlements.ts';
import { PACKAGE_LICENSE_CONFIG } from '../../generated/licenseConfig.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type LicenseTokenPayload = {
  v: 1;
  licenseId: string;
  installationId: string;
  plan: 'basic' | 'standard' | 'pro';
  status: 'active';
  issuedAt: number;
  expiresAt: number;
  refreshAfter: number;
};

export type ResolvedLicenseState = {
  installationId: string | null;
  signedToken: string | null;
  status: string;
  effectivePlan: SubscriptionPlan | null;
  lastCheckedAt: string | null;
  graceUntil: string | null;
  expiresAt: string | null;
  controlPlaneUrl: string;
  token: LicenseTokenPayload | null;
};

type LicenseD1Statement = {
  bind(...values: unknown[]): LicenseD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

type LicenseD1Database = {
  prepare(query: string): LicenseD1Statement;
};

type LicenseEnv = {
  DB?: LicenseD1Database;
  LICENSE_SIGNING_PUBLIC_KEY?: string;
  LICENSE_CONTROL_PLANE_URL?: string;
};

type InstallationMetadata = { projectName?: string | null; hostname?: string | null; appVersion?: string | null };

type ControlPlaneResult = { token: string; license: LicenseTokenPayload };

export class LicenseOperationError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  return base64UrlToBytes(normalized.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
}

export function canonicalLicenseTokenJson(payload: LicenseTokenPayload): string {
  return JSON.stringify({
    v: payload.v,
    licenseId: payload.licenseId,
    installationId: payload.installationId,
    plan: payload.plan,
    status: payload.status,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    refreshAfter: payload.refreshAfter,
  });
}

export async function verifySignedLicenseToken(
  token: string,
  publicKeyBase64: string,
  installationId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<LicenseTokenPayload> {
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra || !publicKeyBase64) throw new Error('invalid license token');
  let payloadText = '';
  let payload: LicenseTokenPayload;
  try {
    payloadText = decoder.decode(base64UrlToBytes(payloadPart));
    payload = JSON.parse(payloadText) as LicenseTokenPayload;
  } catch {
    throw new Error('invalid license token');
  }
  if (canonicalLicenseTokenJson(payload) !== payloadText) throw new Error('invalid license token');
  if (payload.v !== 1 || payload.status !== 'active' || !['basic', 'standard', 'pro'].includes(payload.plan)) throw new Error('invalid license token');
  if (payload.installationId !== installationId || payload.expiresAt <= nowSeconds) throw new Error('invalid license token');

  const key = await crypto.subtle.importKey('raw', base64ToBytes(publicKeyBase64), { name: 'Ed25519' }, false, ['verify']);
  const valid = await crypto.subtle.verify('Ed25519', key, base64UrlToBytes(signaturePart), encoder.encode(payloadText));
  if (!valid) throw new Error('invalid license token');
  return payload;
}

function packageFallbackPlan(): SubscriptionPlan | null {
  return PACKAGE_LICENSE_CONFIG.requiresLicense ? null : 'demo';
}

function controlPlaneUrl(env: LicenseEnv): string {
  return String(env.LICENSE_CONTROL_PLANE_URL || PACKAGE_LICENSE_CONFIG.controlPlaneUrl || '').replace(/\/+$/, '');
}

function publicKey(env: LicenseEnv): string {
  return String(env.LICENSE_SIGNING_PUBLIC_KEY || PACKAGE_LICENSE_CONFIG.publicKeyBase64 || '');
}

export async function ensureInstallationState(env: LicenseEnv, nowMs = Date.now()): Promise<string> {
  if (!env.DB) throw new LicenseOperationError('DATABASE_ERROR', 'ไม่พบการเชื่อมต่อฐานข้อมูล D1', 500);
  const current = await env.DB.prepare('SELECT installation_id FROM license_state WHERE id = 1 LIMIT 1').first<Record<string, unknown>>();
  const existing = String(current?.installation_id || '');
  if (existing) return existing;
  const installationId = crypto.randomUUID();
  const now = new Date(nowMs).toISOString();
  await env.DB.prepare(`INSERT INTO license_state (id, installation_id, status, effective_plan, control_plane_url, updated_at)
    VALUES (1, ?, 'unlicensed', NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET installation_id = CASE WHEN license_state.installation_id = '' THEN excluded.installation_id ELSE license_state.installation_id END,
      control_plane_url = CASE WHEN license_state.control_plane_url = '' THEN excluded.control_plane_url ELSE license_state.control_plane_url END,
      updated_at = excluded.updated_at`).bind(installationId, controlPlaneUrl(env), now).run();
  const persisted = await env.DB.prepare('SELECT installation_id FROM license_state WHERE id = 1 LIMIT 1').first<Record<string, unknown>>();
  return String(persisted?.installation_id || installationId);
}

async function readControlPlaneResponse(response: Response): Promise<ControlPlaneResult> {
  let body: any = null;
  try { body = await response.json(); } catch { /* generic below */ }
  if (!response.ok) {
    const code = String(body?.error?.code || 'LICENSE_REQUEST_FAILED');
    const message = String(body?.error?.message || 'ไม่สามารถตรวจสอบ License ได้');
    throw new LicenseOperationError(code, message, response.status);
  }
  if (!body?.token || !body?.license) throw new LicenseOperationError('INVALID_CONTROL_PLANE_RESPONSE', 'Control Plane ส่งข้อมูล License ไม่ถูกต้อง', 502);
  return { token: String(body.token), license: body.license as LicenseTokenPayload };
}

async function postControlPlane(env: LicenseEnv, endpoint: string, body: Record<string, unknown>): Promise<ControlPlaneResult | { ok: true }> {
  const base = controlPlaneUrl(env);
  if (!base) throw new LicenseOperationError('CONTROL_PLANE_UNAVAILABLE', 'ยังไม่ได้ตั้งค่า License Control Plane', 503);
  let response: Response;
  try {
    response = await fetch(`${base}${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new LicenseOperationError('CONTROL_PLANE_UNAVAILABLE', 'ไม่สามารถเชื่อมต่อ License Control Plane ได้', 503);
  }
  if (endpoint.endsWith('/deactivate')) {
    if (!response.ok) {
      let result: any = null; try { result = await response.json(); } catch { /* generic below */ }
      throw new LicenseOperationError(String(result?.error?.code || 'LICENSE_REQUEST_FAILED'), String(result?.error?.message || 'ไม่สามารถยกเลิก License ได้'), response.status);
    }
    return { ok: true };
  }
  return readControlPlaneResponse(response);
}

async function persistActiveToken(env: LicenseEnv, installationId: string, result: ControlPlaneResult, nowMs: number): Promise<void> {
  if (!env.DB) throw new LicenseOperationError('DATABASE_ERROR', 'ไม่พบการเชื่อมต่อฐานข้อมูล D1', 500);
  const payload = await verifySignedLicenseToken(result.token, publicKey(env), installationId, Math.floor(nowMs / 1000));
  const checkedAt = new Date(nowMs).toISOString();
  const graceUntil = new Date(nowMs + GRACE_MS).toISOString();
  const expiresAt = new Date(payload.expiresAt * 1000).toISOString();
  await env.DB.prepare(`UPDATE license_state SET signed_token = ?, status = 'active', effective_plan = ?, last_checked_at = ?, grace_until = ?, expires_at = ?, control_plane_url = ?, updated_at = ? WHERE id = 1`)
    .bind(result.token, payload.plan, checkedAt, graceUntil, expiresAt, controlPlaneUrl(env), checkedAt).run();
}

export async function activateCustomerLicense(env: LicenseEnv, licenseKey: string, metadata: InstallationMetadata = {}, nowMs = Date.now()): Promise<ResolvedLicenseState> {
  const key = licenseKey.trim();
  if (!key) throw new LicenseOperationError('LICENSE_KEY_REQUIRED', 'กรุณากรอก License Key', 400);
  const installationId = await ensureInstallationState(env, nowMs);
  const result = await postControlPlane(env, '/v1/licenses/activate', {
    licenseKey: key, installationId, projectName: metadata.projectName || null, hostname: metadata.hostname || null, appVersion: metadata.appVersion || null,
  });
  if ('ok' in result) throw new LicenseOperationError('INVALID_CONTROL_PLANE_RESPONSE', 'Control Plane ส่งข้อมูล License ไม่ถูกต้อง', 502);
  await persistActiveToken(env, installationId, result, nowMs);
  return resolveLicenseState(env, 0, nowMs);
}

export async function refreshCustomerLicense(env: LicenseEnv, metadata: InstallationMetadata = {}, nowMs = Date.now()): Promise<ResolvedLicenseState> {
  if (!env.DB) throw new LicenseOperationError('DATABASE_ERROR', 'ไม่พบการเชื่อมต่อฐานข้อมูล D1', 500);
  const installationId = await ensureInstallationState(env, nowMs);
  const row = await env.DB.prepare('SELECT signed_token, last_checked_at, grace_until FROM license_state WHERE id = 1 LIMIT 1').first<Record<string, unknown>>();
  const token = String(row?.signed_token || '');
  if (!token) throw new LicenseOperationError('LICENSE_REQUIRED', 'ยังไม่ได้ Activate License', 409);
  try {
    const result = await postControlPlane(env, '/v1/licenses/refresh', {
      token, installationId, projectName: metadata.projectName || null, hostname: metadata.hostname || null,
    });
    if ('ok' in result) throw new LicenseOperationError('INVALID_CONTROL_PLANE_RESPONSE', 'Control Plane ส่งข้อมูล License ไม่ถูกต้อง', 502);
    await persistActiveToken(env, installationId, result, nowMs);
  } catch (error) {
    if (error instanceof LicenseOperationError && ['INVALID_TOKEN', 'LICENSE_INVALID', 'LICENSE_INACTIVE', 'LICENSE_EXPIRED', 'ACTIVATION_REVOKED'].includes(error.code)) {
      const now = new Date(nowMs).toISOString();
      const nextStatus = error.code === 'LICENSE_EXPIRED' ? 'expired' : 'revoked';
      await env.DB.prepare(`UPDATE license_state SET status = ?, effective_plan = NULL, updated_at = ? WHERE id = 1`)
        .bind(nextStatus, now).run();
      throw error;
    }
    if (!(error instanceof LicenseOperationError) || error.code !== 'CONTROL_PLANE_UNAVAILABLE') throw error;
    const lastCheckedMs = row?.last_checked_at ? Date.parse(String(row.last_checked_at)) : NaN;
    const graceUntilMs = Number.isFinite(lastCheckedMs) ? lastCheckedMs + GRACE_MS : (row?.grace_until ? Date.parse(String(row.grace_until)) : NaN);
    const state = await resolveLicenseState(env, 0, nowMs);
    const usableOffline = Boolean(state.token) && Number.isFinite(graceUntilMs) && nowMs <= graceUntilMs;
    const now = new Date(nowMs).toISOString();
    await env.DB.prepare(`UPDATE license_state SET status = ?, grace_until = ?, effective_plan = ?, updated_at = ? WHERE id = 1`)
      .bind(usableOffline ? 'offline' : 'expired', Number.isFinite(graceUntilMs) ? new Date(graceUntilMs).toISOString() : null, usableOffline ? state.token?.plan || null : null, now).run();
  }
  return resolveLicenseState(env, 0, nowMs);
}

export async function deactivateCustomerLicense(env: LicenseEnv, nowMs = Date.now()): Promise<ResolvedLicenseState> {
  if (!env.DB) throw new LicenseOperationError('DATABASE_ERROR', 'ไม่พบการเชื่อมต่อฐานข้อมูล D1', 500);
  const installationId = await ensureInstallationState(env, nowMs);
  const row = await env.DB.prepare('SELECT signed_token FROM license_state WHERE id = 1 LIMIT 1').first<Record<string, unknown>>();
  const token = String(row?.signed_token || '');
  if (token) await postControlPlane(env, '/v1/licenses/deactivate', { token, installationId });
  const now = new Date(nowMs).toISOString();
  await env.DB.prepare(`UPDATE license_state SET signed_token = NULL, status = 'unlicensed', effective_plan = NULL, last_checked_at = ?, grace_until = NULL, expires_at = NULL, updated_at = ? WHERE id = 1`).bind(now, now).run();
  return resolveLicenseState(env, 0, nowMs);
}

export async function resolveLicenseState(env: LicenseEnv, _ownerId: number, nowMs = Date.now()): Promise<ResolvedLicenseState> {
  const fallbackUrl = controlPlaneUrl(env);
  if (!env.DB) {
    return { installationId: null, signedToken: null, status: 'unlicensed', effectivePlan: packageFallbackPlan(), lastCheckedAt: null, graceUntil: null, expiresAt: null, controlPlaneUrl: fallbackUrl, token: null };
  }
  let row = await env.DB.prepare('SELECT installation_id, signed_token, status, effective_plan, last_checked_at, grace_until, expires_at, control_plane_url FROM license_state WHERE id = 1 LIMIT 1').first<Record<string, unknown>>();
  if (!row) {
    await ensureInstallationState(env, nowMs);
    row = await env.DB.prepare('SELECT installation_id, signed_token, status, effective_plan, last_checked_at, grace_until, expires_at, control_plane_url FROM license_state WHERE id = 1 LIMIT 1').first<Record<string, unknown>>();
  }
  if (!row) {
    return { installationId: null, signedToken: null, status: 'unlicensed', effectivePlan: packageFallbackPlan(), lastCheckedAt: null, graceUntil: null, expiresAt: null, controlPlaneUrl: fallbackUrl, token: null };
  }

  const installationId = String(row.installation_id || '');
  const signedToken = row.signed_token ? String(row.signed_token) : null;
  const storedStatus = String(row.status || 'unlicensed');
  const base = {
    installationId: installationId || null,
    signedToken,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    graceUntil: row.grace_until ? String(row.grace_until) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    controlPlaneUrl: String(row.control_plane_url || fallbackUrl),
  };
  if (!signedToken || !installationId) {
    return { ...base, status: storedStatus, effectivePlan: packageFallbackPlan(), token: null };
  }

  if (['revoked', 'expired', 'suspended'].includes(storedStatus)) {
    return { ...base, status: storedStatus, effectivePlan: packageFallbackPlan(), token: null };
  }

  try {
    const payload = await verifySignedLicenseToken(signedToken, publicKey(env), installationId, Math.floor(nowMs / 1000));
    const graceUntilMs = base.graceUntil ? Date.parse(base.graceUntil) : NaN;
    if (storedStatus === 'offline' && (!Number.isFinite(graceUntilMs) || nowMs > graceUntilMs)) {
      return { ...base, status: 'expired', effectivePlan: packageFallbackPlan(), expiresAt: new Date(payload.expiresAt * 1000).toISOString(), token: payload };
    }
    return { ...base, status: storedStatus === 'offline' ? 'offline' : 'active', effectivePlan: payload.plan, expiresAt: new Date(payload.expiresAt * 1000).toISOString(), token: payload };
  } catch {
    const expired = row.expires_at ? Date.parse(String(row.expires_at)) <= nowMs : false;
    return { ...base, status: expired ? 'expired' : (['revoked', 'suspended'].includes(storedStatus) ? storedStatus : 'invalid'), effectivePlan: packageFallbackPlan(), token: null };
  }
}

export async function maybeRefreshCustomerLicense(env: LicenseEnv, metadata: InstallationMetadata = {}, nowMs = Date.now()): Promise<ResolvedLicenseState> {
  const state = await resolveLicenseState(env, 0, nowMs);
  if (!state.token || !PACKAGE_LICENSE_CONFIG.requiresLicense) return state;
  if (state.token.refreshAfter * 1000 > nowMs && state.status !== 'offline') return state;
  try { return await refreshCustomerLicense(env, metadata, nowMs); }
  catch (error) {
    if (error instanceof LicenseOperationError && ['INVALID_TOKEN', 'LICENSE_INVALID', 'LICENSE_INACTIVE', 'LICENSE_EXPIRED', 'ACTIVATION_REVOKED'].includes(error.code)) {
      if (env.DB) {
        const now = new Date(nowMs).toISOString();
        const nextStatus = error.code === 'LICENSE_EXPIRED' ? 'expired' : 'revoked';
        await env.DB.prepare(`UPDATE license_state SET status = ?, effective_plan = NULL, updated_at = ? WHERE id = 1`).bind(nextStatus, now).run();
        return resolveLicenseState(env, 0, nowMs);
      }
    }
    throw error;
  }
}

export async function resolveEffectivePlan(env: LicenseEnv, ownerId: number, nowMs = Date.now()): Promise<SubscriptionPlan | null> {
  return (await resolveLicenseState(env, ownerId, nowMs)).effectivePlan;
}

export function assertMutationAllowedByLicense(state: ResolvedLicenseState): void {
  if (!PACKAGE_LICENSE_CONFIG.requiresLicense) return;
  if ((state.status === 'active' || state.status === 'offline') && state.effectivePlan) return;
  throw new LicenseOperationError('LICENSE_READ_ONLY', 'License ไม่พร้อมใช้งาน ระบบอยู่ในโหมดอ่านอย่างเดียว', 403);
}
