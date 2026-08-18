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

  ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
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
  const waitFor = async (expression, label, attempts = 100) => {
    for (let i = 0; i < attempts; i += 1) {
      try { if (await evaluate(expression)) return; } catch {}
      await sleep(150);
    }
    throw new Error(`timeout waiting for ${label}`);
  };
  const navigate = async (url) => {
    await send('Page.navigate', { url });
    await waitFor('document.readyState === "complete" || document.readyState === "interactive"', `navigation ${url}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${baseUrl}/`);
  await waitFor('document.body && document.body.innerText.length > 0', 'login body');
  await waitFor('getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim().length > 0', 'branding token');
  await waitFor(`document.body.innerText.includes(${JSON.stringify(expectedDorm)})`, 'runtime dorm name on login');

  const loginState = await evaluate(`(() => ({
    brand: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toUpperCase(),
    dormVisible: document.body.innerText.includes(${JSON.stringify(expectedDorm)}),
    logoVisible: [...document.querySelectorAll('img')].some(el => el.alt === ${JSON.stringify(`${expectedDorm} logo`)} && getComputedStyle(el).display !== 'none'),
    loginVisible: document.body.innerText.includes('เข้าสู่ระบบ'),
    bootLoading: document.documentElement.dataset.brandingBoot === 'loading'
  }))()`);
  if (loginState.brand !== expectedColor) throw new Error(`login brand ${loginState.brand} != ${expectedColor}`);
  if (!loginState.dormVisible || !loginState.loginVisible || loginState.bootLoading) throw new Error(`login state invalid: ${JSON.stringify(loginState)}`);
  if (loginState.logoVisible !== expectLogo) throw new Error(`login logo expectation failed: ${JSON.stringify(loginState)}`);

  await evaluate(`localStorage.setItem('local_user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('local_token', ${JSON.stringify(token)}); location.reload(); true`);
  await waitFor('document.querySelector("aside") !== null', 'authenticated desktop shell', 160);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(expectedDorm)})`, 'authenticated dorm name', 160);

  const desktopState = await evaluate(`(() => {
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const aside = [...document.querySelectorAll('aside')].find(visible);
    const active = aside?.querySelector('button[aria-current="page"]');
    const dorm = [...document.querySelectorAll('h1')].find(el => visible(el) && el.textContent.trim() === ${JSON.stringify(expectedDorm)});
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
  const clicked = await evaluate(`(() => {
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const header = [...document.querySelectorAll('header')].find(visible);
    if (!header) return false;
    const buttons = [...header.querySelectorAll('button')].filter(visible);
    if (buttons.length < 2) return false;
    buttons.at(-1).click();
    return true;
  })()`);
  if (!clicked) throw new Error('mobile menu button not found');
  await waitFor('document.querySelector("nav[aria-label=\"เมนูหลักบนมือถือ\"]") !== null', 'mobile drawer');
  await sleep(500);

  const mobileState = await evaluate(`(() => {
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const header = [...document.querySelectorAll('header')].find(visible);
    const nav = [...document.querySelectorAll('nav[aria-label="เมนูหลักบนมือถือ"]')].find(visible);
    const active = nav?.querySelector('button[aria-current="page"]');
    const dormVisible = [...document.querySelectorAll('h1')].some(el => visible(el) && el.textContent.trim() === ${JSON.stringify(expectedDorm)});
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
  proc.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => proc.once('exit', resolve)), sleep(1500)]);
  if (proc.exitCode === null) proc.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true });
}
