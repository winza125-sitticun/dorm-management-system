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
const expectedFooter = process.env.SMOKE_EXPECTED_FOOTER || '';
const expectedPhone = process.env.SMOKE_EXPECTED_PHONE || '';
const expectPaidIdentity = (process.env.SMOKE_EXPECT_PAID_IDENTITY || '').toLowerCase() === 'true';
const hiddenFooter = process.env.SMOKE_HIDDEN_FOOTER || '';
const hiddenPhone = process.env.SMOKE_HIDDEN_PHONE || '';
const user = JSON.parse(await readFile(required('SMOKE_USER_JSON'), 'utf8'));
const token = (await readFile(required('SMOKE_TOKEN_FILE'), 'utf8')).trim();
const output = required('SMOKE_OUTPUT');
const chrome = required('CHROME_BIN');

const hexToRgb = (hex) => {
  const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(hex);
  if (!m) throw new Error(`invalid expected color ${hex}`);
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
};
const expectedRgb = hexToRgb(expectedColor);

const profile = await mkdtemp(join(tmpdir(), 'v15-task6-v2-chrome-'));
const proc = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

async function readDevtoolsPort() {
  const path = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 120; i += 1) {
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
      if (browserEvents.length > 30) browserEvents.shift();
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
        brand: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),
        body: (document.body?.innerText || '').slice(0, 1500),
        invoice: (document.querySelector('.print-container')?.innerText || '').slice(0, 1400)
      }))()`);
    } catch (error) {
      return { diagnosticError: String(error) };
    }
  };

  const waitFor = async (expression, label, attempts = 180) => {
    for (let i = 0; i < attempts; i += 1) {
      try { if (await evaluate(expression)) return; } catch {}
      await sleep(150);
    }
    const events = browserEvents.slice(-10).map((event) => ({
      method: event.method,
      text: event.params?.entry?.text || event.params?.type || event.params?.exceptionDetails?.text || null,
      description: event.params?.exceptionDetails?.exception?.description || null,
    }));
    throw new Error(`timeout waiting for ${label}; snapshot=${JSON.stringify(await diagnosticSnapshot())}; events=${JSON.stringify(events)}; chrome=${stderr.slice(-900)}`);
  };

  const navigate = async (url) => {
    const result = await send('Page.navigate', { url });
    if (result?.errorText) throw new Error(`navigation failed ${url}: ${result.errorText}`);
    await waitFor('document.readyState === "complete" || document.readyState === "interactive"', `navigation ${url}`);
  };

  const reactClick = async (finderExpression, label) => {
    const result = await evaluate(`(() => {
      const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      const el = ${finderExpression};
      if (!el || !visible(el)) return { ok: false, reason: 'target-not-visible' };
      const key = Object.keys(el).find((name) => name.startsWith('__reactProps$'));
      const onClick = key ? el[key]?.onClick : null;
      if (typeof onClick !== 'function') return { ok: false, reason: 'react-onClick-not-found', keys: Object.keys(el).filter((name) => name.startsWith('__react')).slice(0, 5) };
      onClick({ currentTarget: el, target: el, preventDefault() {}, stopPropagation() {} });
      return { ok: true, text: (el.textContent || '').trim(), title: el.getAttribute('title') };
    })()`);
    if (!result?.ok) throw new Error(`${label} React handler not invoked: ${JSON.stringify(result)}; snapshot=${JSON.stringify(await diagnosticSnapshot())}`);
    await sleep(250);
    return result;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${baseUrl}/`);
  await waitFor('document.body && document.body.innerText.length > 0', 'login body');
  await waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toUpperCase() === ${JSON.stringify(expectedColor)}`, 'root brand token');

  await evaluate(`localStorage.setItem('local_user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('local_token', ${JSON.stringify(token)}); location.reload(); true`);
  await waitFor('document.querySelector("aside") !== null', 'authenticated shell');
  await waitFor(`[...document.querySelectorAll('h1')].some(el => (el.textContent || '').trim() === ${JSON.stringify(expectedDorm)})`, 'authenticated dorm name');
  await waitFor(`[...document.querySelectorAll('button')].some(el => (el.textContent || '').trim() === 'ดูบิล')`, 'dashboard bill button');

  await reactClick(`([...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === 'ดูบิล'))`, 'dashboard bill');
  await waitFor(`document.querySelector('.print-container') !== null`, 'BillInvoice modal');
  await waitFor(`document.querySelector('.print-container')?.innerText.includes(${JSON.stringify(expectedDorm)})`, 'invoice dorm name');

  const invoiceState = await evaluate(`(() => {
    const invoice = document.querySelector('.print-container');
    const heading = [...invoice.querySelectorAll('h4')].find(el => (el.textContent || '').trim() === ${JSON.stringify(expectedDorm)});
    const logo = invoice.querySelector('img[alt=${JSON.stringify(`${expectedDorm} logo`)}]');
    const totalLabel = [...invoice.querySelectorAll('*')].find(el => (el.textContent || '').trim() === 'ยอดรวมที่ต้องชำระ');
    let totalBox = totalLabel;
    while (totalBox && totalBox !== invoice && getComputedStyle(totalBox).backgroundColor !== ${JSON.stringify(expectedRgb)}) totalBox = totalBox.parentElement;
    if (totalBox === invoice) totalBox = null;
    const tableHead = invoice.querySelector('thead tr');
    return {
      rootBrand: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toUpperCase(),
      headingVisible: !!heading,
      headingColor: heading ? getComputedStyle(heading).color : null,
      logoVisible: !!logo && getComputedStyle(logo).display !== 'none',
      tableHeadColor: tableHead ? getComputedStyle(tableHead).backgroundColor : null,
      totalBoxColor: totalBox ? getComputedStyle(totalBox).backgroundColor : null,
      hasFooter: ${JSON.stringify(expectedFooter)} ? invoice.innerText.includes(${JSON.stringify(expectedFooter)}) : false,
      hasPhone: ${JSON.stringify(expectedPhone)} ? invoice.innerText.includes(${JSON.stringify(expectedPhone)}) : false,
      leakedFooter: ${JSON.stringify(hiddenFooter)} ? invoice.innerText.includes(${JSON.stringify(hiddenFooter)}) : false,
      leakedPhone: ${JSON.stringify(hiddenPhone)} ? invoice.innerText.includes(${JSON.stringify(hiddenPhone)}) : false,
      semanticAmber: !!invoice.querySelector('.text-amber-500'),
      semanticBlue: !!invoice.querySelector('.text-blue-500'),
      semanticPurple: !!invoice.querySelector('.text-purple-500')
    };
  })()`);

  if (invoiceState.rootBrand !== expectedColor) throw new Error(`root brand mismatch ${JSON.stringify(invoiceState)}`);
  if (!invoiceState.headingVisible || invoiceState.headingColor !== expectedRgb) throw new Error(`invoice heading branding invalid ${JSON.stringify(invoiceState)}`);
  if (invoiceState.tableHeadColor !== expectedRgb || invoiceState.totalBoxColor !== expectedRgb) throw new Error(`invoice brand surfaces invalid ${JSON.stringify(invoiceState)}`);
  if (!invoiceState.semanticAmber || !invoiceState.semanticBlue || !invoiceState.semanticPurple) throw new Error(`semantic palette markers missing ${JSON.stringify(invoiceState)}`);
  if (expectPaidIdentity) {
    if (!invoiceState.logoVisible || !invoiceState.hasFooter || !invoiceState.hasPhone) throw new Error(`paid invoice identity missing ${JSON.stringify(invoiceState)}`);
  } else if (invoiceState.logoVisible || invoiceState.leakedFooter || invoiceState.leakedPhone) {
    throw new Error(`masked invoice leaked paid identity ${JSON.stringify(invoiceState)}`);
  }

  await evaluate(`(() => {
    window.__task6Download = null;
    HTMLAnchorElement.prototype.click = function() {
      window.__task6Download = { href: this.href, download: this.download };
    };
    return true;
  })()`);
  await reactClick(`([...document.querySelectorAll('button')].find(el => (el.textContent || '').includes('เซฟรูป JPG')))`, 'JPG export');
  await waitFor(`window.__task6Download && window.__task6Download.href.startsWith('data:image/jpeg')`, 'JPG generation', 300);
  await waitFor(`[...document.querySelectorAll('button')].some(el => (el.textContent || '').includes('เซฟรูป JPG'))`, 'JPG button recovery', 140);
  const jpgState = await evaluate(`(() => ({
    mimeOk: window.__task6Download.href.startsWith('data:image/jpeg'),
    length: window.__task6Download.href.length,
    filename: window.__task6Download.download,
    buttonRecovered: [...document.querySelectorAll('button')].some(el => (el.textContent || '').includes('เซฟรูป JPG'))
  }))()`);
  if (!jpgState.mimeOk || jpgState.length < 1000 || !/\.jpg$/i.test(jpgState.filename) || !jpgState.buttonRecovered) {
    throw new Error(`JPG export invalid ${JSON.stringify(jpgState)}`);
  }

  await evaluate(`(() => {
    window.__task6PrintCss = '';
    window.__task6PrintCalled = false;
    window.print = () => {
      window.__task6PrintCalled = true;
      window.__task6PrintCss = [...document.querySelectorAll('style')].map(el => el.textContent || '').find(text => text.includes('.print-container') && text.includes('print-color-adjust')) || '';
    };
    return true;
  })()`);
  await reactClick(`([...document.querySelectorAll('button')].find(el => (el.textContent || '').includes('พิมพ์ / PDF')))`, 'print/PDF');
  await waitFor('window.__task6PrintCalled === true', 'print callback');
  const printState = await evaluate(`(() => ({ called: window.__task6PrintCalled === true, css: window.__task6PrintCss }))()`);
  if (!printState.called || !printState.css.toUpperCase().includes(expectedColor) || !printState.css.includes('print-color-adjust: exact')) {
    throw new Error(`print/PDF CSS invalid ${JSON.stringify(printState)}`);
  }

  let logoFallback = { exercised: false, fallbackVisible: !expectPaidIdentity };
  if (expectPaidIdentity) {
    const dispatched = await evaluate(`(() => {
      const img = document.querySelector('.print-container img[alt=${JSON.stringify(`${expectedDorm} logo`)}]');
      if (!img) return false;
      img.dispatchEvent(new Event('error'));
      return true;
    })()`);
    if (!dispatched) throw new Error('cannot exercise logo error fallback');
    await waitFor(`document.querySelector('.print-container img[alt=${JSON.stringify(`${expectedDorm} logo`)}]') === null`, 'logo fallback after error');
    logoFallback = await evaluate(`(() => {
      const invoice = document.querySelector('.print-container');
      const heading = [...invoice.querySelectorAll('h4')].find(el => (el.textContent || '').trim() === ${JSON.stringify(expectedDorm)});
      const logoWrap = heading?.closest('div.flex')?.querySelector('div.w-16.h-16');
      return { exercised: true, fallbackVisible: !!logoWrap?.querySelector('svg') };
    })()`);
    if (!logoFallback.fallbackVisible) throw new Error(`logo fallback missing ${JSON.stringify(logoFallback)}`);
  }

  await writeFile(output, `${JSON.stringify({
    expectedDorm,
    expectedColor,
    expectPaidIdentity,
    invoice: invoiceState,
    jpg: jpgState,
    print: {
      called: printState.called,
      containsExpectedColor: printState.css.toUpperCase().includes(expectedColor),
      exactColorAdjust: printState.css.includes('print-color-adjust: exact')
    },
    logoFallback,
    overallPass: true
  }, null, 2)}\n`);
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
    console.error('[task6-browser-export-smoke-v2] profile cleanup warning:', cleanupError);
  }
}
