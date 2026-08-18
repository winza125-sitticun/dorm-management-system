import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};

const baseUrl = required('SMOKE_BASE_URL').replace(/\/$/, '');
const expectedDorm = required('SMOKE_EXPECTED_DORM');
const expectedColor = required('SMOKE_EXPECTED_COLOR').toUpperCase();
const expectLogo = (process.env.SMOKE_EXPECT_LOGO || '').toLowerCase() === 'true';
const user = JSON.parse(await readFile(required('SMOKE_USER_JSON'), 'utf8'));
const token = (await readFile(required('SMOKE_TOKEN_FILE'), 'utf8')).trim();
const output = required('SMOKE_OUTPUT');
const chrome = required('CHROME_BIN');

const profile = await mkdtemp(join(tmpdir(), 'v15-task5-chrome-'));
const proc = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

async function readDevtoolsPort() {
  const path = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i += 1) {
    try {
      const lines = (await readFile(path, 'utf8')).trim().split(/\r?\n/);
      const port = Number(lines[0]);
      if (port > 0) return port;
    } catch {}
    if (proc.exitCode !== null) throw new Error(`chrome exited early: ${stderr.slice(-1000)}`);
    await sleep(100);
  }
  throw new Error('DevToolsActivePort timeout');
}

let ws;
try {
  const port = await readDevtoolsPort();
  let targets;
  for (let i = 0; i < 100; i += 1) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      if (targets?.length) break;
    } catch {}
    await sleep(100);
  }
  if (!targets?.length) throw new Error('no Chrome page target');

  const target = targets.find((item) => item.type === 'page') || targets[0];
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const browserEvents = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    if (['Runtime.exceptionThrown', 'Runtime.consoleAPICalled', 'Log.entryAdded'].includes(message.method)) {
      browserEvents.push({ method: message.method, params: message.params });
      if (browserEvents.length > 20) browserEvents.shift();
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`browser eval failed: ${JSON.stringify(result.exceptionDetails)}`);
    return result.result?.value;
  };
  const diagnosticSnapshot = async () => {
    try {
      return await evaluate(`(() => ({
        href: location.href,
        readyState: document.readyState,
        title: document.title,
        boot: document.documentElement?.dataset?.brandingBoot || null,
        brand: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),
        bodyText: (document.body?.innerText || '').slice(0, 600),
        bodyTextContent: (document.body?.textContent || '').slice(0, 600),
        bodyHtml: (document.body?.innerHTML || '').slice(0, 1200),
        rootHtml: (document.querySelector('#root')?.innerHTML || '').slice(0, 1200),
        scriptCount: document.scripts.length
      }))()`);
    } catch (error) {
      return { diagnosticError: String(error) };
    }
  };
  const waitFor = async (expression, label, attempts = 100) => {
    for (let i = 0; i < attempts; i += 1) {
      try { if (await evaluate(expression)) return; } catch {}
      await sleep(150);
    }
    const snapshot = await diagnosticSnapshot();
    const eventSummary = browserEvents.slice(-8).map((event) => ({
      method: event.method,
      text: event.params?.entry?.text || event.params?.type || event.params?.exceptionDetails?.text || null,
      description: event.params?.exceptionDetails?.exception?.description || null,
    }));
    throw new Error(`timeout waiting for ${label}; snapshot=${JSON.stringify(snapshot)}; events=${JSON.stringify(eventSummary)}; chrome=${stderr.slice(-800)}`);
  };
  const dormHeadingExpression = `[...document.querySelectorAll('h1')].some(el => (el.textContent || '').trim() === ${JSON.stringify(expectedDorm)})`;
  const navigate = async (url) => {
    const result = await send('Page.navigate', { url });
    if (result?.errorText) throw new Error(`navigation failed ${url}: ${result.errorText}`);
    await waitFor('document.readyState === "complete" || document.readyState === "interactive"', `navigation ${url}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${baseUrl}/`);
  await waitFor('document.body && document.body.innerText.length > 0', 'login body');
  await waitFor('getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim().length > 0', 'branding token');
  await waitFor(dormHeadingExpression, 'runtime dorm name on login');

  const loginState = await evaluate(`(() => ({
    brand: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toUpperCase(),
    dormVisible: [...document.querySelectorAll('h1')].some(el => (el.textContent || '').trim() === ${JSON.stringify(expectedDorm)}),
    logoVisible: [...document.querySelectorAll('img')].some(el => el.alt === ${JSON.stringify(`${expectedDorm} logo`)} && getComputedStyle(el).display !== 'none'),
    loginVisible: document.body.innerText.includes('เข้าสู่ระบบ'),
    bootLoading: document.documentElement.dataset.brandingBoot === 'loading'
  }))()`);
  if (loginState.brand !== expectedColor) throw new Error(`login brand ${loginState.brand} != ${expectedColor}`);
  if (!loginState.dormVisible || !loginState.loginVisible || loginState.bootLoading) throw new Error(`login state invalid: ${JSON.stringify(loginState)}`);
  if (loginState.logoVisible !== expectLogo) throw new Error(`login logo expectation failed: ${JSON.stringify(loginState)}`);

  await evaluate(`localStorage.setItem('local_user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('local_token', ${JSON.stringify(token)}); location.reload(); true`);
  await waitFor('document.querySelector("aside") !== null', 'authenticated desktop shell', 160);
  await waitFor(dormHeadingExpression, 'authenticated dorm name', 160);

  const desktopState = await evaluate(`(() => {
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const aside = [...document.querySelectorAll('aside')].find(visible);
    const active = aside?.querySelector('button[aria-current="page"]');
    const dorm = [...document.querySelectorAll('h1')].find(el => visible(el) && (el.textContent || '').trim() === ${JSON.stringify(expectedDorm)});
    return {
      brand: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toUpperCase(),
      asideVisible: visible(aside), dormVisible: !!dorm,
      logoVisible: [...document.querySelectorAll('img')].some(el => visible(el) && el.alt === ${JSON.stringify(`${expectedDorm} logo`)}),
      activeBrandClass: !!active && active.className.includes('bg-[var(--brand-primary)]'),
      activeContrastClass: !!active && active.className.includes('text-[var(--brand-contrast)]')
    };
  })()`);
  if (desktopState.brand !== expectedColor || !desktopState.asideVisible || !desktopState.dormVisible || !desktopState.activeBrandClass || !desktopState.activeContrastClass) {
    throw new Error(`desktop shell invalid: ${JSON.stringify(desktopState)}`);
  }
  if (desktopState.logoVisible !== expectLogo) throw new Error(`desktop logo expectation failed: ${JSON.stringify(desktopState)}`);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(400);
  const menuFocused = await evaluate(`(() => {
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const button = [...document.querySelectorAll('button[aria-label="เปิดเมนู"]')].find(visible);
    if (!button) return false;
    button.focus();
    return document.activeElement === button;
  })()`);
  if (!menuFocused) throw new Error('mobile menu button could not receive focus');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await waitFor(`document.querySelector('nav[aria-label="เมนูหลักบนมือถือ"]') !== null`, 'mobile drawer');
  await sleep(500);

  const mobileState = await evaluate(`(() => {
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const header = [...document.querySelectorAll('header')].find(el => visible(el) && el.classList.contains('md:hidden'));
    const nav = [...document.querySelectorAll('nav[aria-label="เมนูหลักบนมือถือ"]')].find(visible);
    const active = nav?.querySelector('button[aria-current="page"]');
    const dormVisible = [...document.querySelectorAll('h1')].some(el => visible(el) && (el.textContent || '').trim() === ${JSON.stringify(expectedDorm)});
    return {
      brand: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toUpperCase(),
      headerVisible: visible(header), drawerVisible: visible(nav), dormVisible,
      activeBrandClass: !!active && active.className.includes('bg-[var(--brand-primary)]'),
      activeContrastClass: !!active && active.className.includes('text-[var(--brand-contrast)]')
    };
  })()`);
  if (mobileState.brand !== expectedColor || !mobileState.headerVisible || !mobileState.drawerVisible || !mobileState.dormVisible || !mobileState.activeBrandClass || !mobileState.activeContrastClass) {
    throw new Error(`mobile shell invalid: ${JSON.stringify(mobileState)}`);
  }

  const evidence = { expectedDorm, expectedColor, expectLogo, login: loginState, desktop: desktopState, mobile: mobileState, overallPass: true };
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  try { ws?.close(); } catch {}
  if (proc.exitCode === null) {
    proc.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => proc.once('exit', resolve)), sleep(1500)]);
  }
  if (proc.exitCode === null) {
    proc.kill('SIGKILL');
    await Promise.race([new Promise((resolve) => proc.once('exit', resolve)), sleep(1500)]);
  }
  try {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (cleanupError) {
    console.error('[task5-browser-smoke] profile cleanup warning:', cleanupError);
  }
}
