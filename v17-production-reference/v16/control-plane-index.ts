import { activateLicense, deactivateLicense, LicenseError, refreshLicense, type ControlPlaneEnv } from './license.service.ts';

type Env = ControlPlaneEnv;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function readJson(request: Request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new LicenseError('INVALID_REQUEST', 'Expected application/json.', 415);
  try { return await request.json() as Record<string, unknown>; }
  catch { throw new LicenseError('INVALID_REQUEST', 'Invalid JSON body.', 400); }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, 405);
  const path = new URL(request.url).pathname;
  const body = await readJson(request);
  if (path === '/v1/licenses/activate') {
    const ip = request.headers.get('cf-connecting-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';
    const result = await activateLicense(env, {
      licenseKey: String(body.licenseKey || ''), installationId: String(body.installationId || ''),
      projectName: body.projectName == null ? null : String(body.projectName), hostname: body.hostname == null ? null : String(body.hostname),
      ipHash: ip ? await sha256Hex(ip) : null, userAgentHash: userAgent ? await sha256Hex(userAgent) : null,
    });
    return json({ token: result.token, license: result.payload, idempotent: result.idempotent });
  }
  if (path === '/v1/licenses/refresh') {
    const result = await refreshLicense(env, {
      token: String(body.token || ''), installationId: String(body.installationId || ''),
      projectName: body.projectName == null ? null : String(body.projectName), hostname: body.hostname == null ? null : String(body.hostname),
    });
    return json({ token: result.token, license: result.payload });
  }
  if (path === '/v1/licenses/deactivate') {
    await deactivateLicense(env, { token: String(body.token || ''), installationId: String(body.installationId || '') });
    return json({ ok: true });
  }
  return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return await handle(request, env); }
    catch (error) {
      if (error instanceof LicenseError) return json({ error: { code: error.code, message: error.message } }, error.status);
      console.error('control-plane error', error instanceof Error ? error.message : 'unknown');
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Internal error.' } }, 500);
    }
  },
};
