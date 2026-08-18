import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const required = (name) => { const v = process.env[name]; if (!v) throw new Error(`missing ${name}`); return v; };
const baseUrl = required('SMOKE_BASE_URL').replace(/\/$/, '');
const expectedDorm = required('SMOKE_EXPECTED_DORM');
const expectedColor = required('SMOKE_EXPECTED_COLOR').toUpperCase();
const roomNumber = required('SMOKE_ROOM_NUMBER');
const tenantPhone = required('SMOKE_TENANT_PHONE');
const expectLogo = (process.env.SMOKE_EXPECT_LOGO || '').toLowerCase() === 'true';
const output = required('SMOKE_OUTPUT');
const chrome = required('CHROME_BIN');
const hexToRgb = (hex) => {
  const m = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad color ${hex}`);
  return `rgb(${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)})`;
};
const expectedRgb = hexToRgb(expectedColor);
const profile = await mkdtemp(join(tmpdir(), 'v15-task7-chrome-'));
const proc = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], {stdio:['ignore','ignore','pipe']});
let stderr=''; proc.stderr.on('data', c => { stderr += c.toString(); });
async function devtoolsPort() {
  const p=join(profile,'DevToolsActivePort');
  for (let i=0;i<120;i++){ try { const n=Number((await readFile(p,'utf8')).split(/\r?\n/)[0]); if(n>0)return n; } catch {} if(proc.exitCode!==null)throw new Error(`chrome exited: ${stderr.slice(-800)}`); await sleep(100); }
  throw new Error('DevToolsActivePort timeout');
}
let ws;
try {
  const port=await devtoolsPort();
  let targets;
  for(let i=0;i<100;i++){ try { targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if(targets?.length)break; } catch {} await sleep(100); }
  if(!targets?.length)throw new Error('no page target');
  ws=new WebSocket((targets.find(x=>x.type==='page')||targets[0]).webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ ws.onopen=resolve; ws.onerror=reject; });
  let id=0; const pending=new Map();
  ws.onmessage=(event)=>{ const m=JSON.parse(event.data); if(m.id&&pending.has(m.id)){ const p=pending.get(m.id); pending.delete(m.id); m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result); } };
  const send=(method,params={})=>new Promise((resolve,reject)=>{ const mid=++id; pending.set(mid,{resolve,reject}); ws.send(JSON.stringify({id:mid,method,params})); });
  const evalJs=async(expression)=>{ const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails)throw new Error(`eval failed ${JSON.stringify(r.exceptionDetails)}`); return r.result?.value; };
  const snapshot=async()=>evalJs(`(() => ({href:location.href,brand:getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),body:(document.body?.innerText||'').slice(0,1800)}))()`);
  const waitFor=async(expression,label,attempts=220)=>{ for(let i=0;i<attempts;i++){ try{ if(await evalJs(expression))return; }catch{} await sleep(150);} throw new Error(`timeout ${label}; ${JSON.stringify(await snapshot())}; chrome=${stderr.slice(-700)}`); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`${baseUrl}/tenant-portal`});
  await waitFor('document.readyState === "complete" || document.readyState === "interactive"','navigation');
  await waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toUpperCase() === ${JSON.stringify(expectedColor)}`,'brand token');
  await waitFor(`[...document.querySelectorAll('h1')].some(el => (el.textContent||'').trim() === ${JSON.stringify(expectedDorm)})`,'lookup dorm name');
  const lookup=await evalJs(`(() => {
    const logo=document.querySelector('img[alt=${JSON.stringify(`${expectedDorm} logo`)}]');
    const submit=[...document.querySelectorAll('button')].find(el => (el.textContent||'').includes('ค้นหารายการบิลของฉัน'));
    return {
      dormVisible:[...document.querySelectorAll('h1')].some(el => (el.textContent||'').trim() === ${JSON.stringify(expectedDorm)}),
      logoVisible:!!logo && getComputedStyle(logo).display!=='none',
      submitBg:submit?getComputedStyle(submit).backgroundColor:null,
      submitColor:submit?getComputedStyle(submit).color:null,
      bootGone:!document.querySelector('[data-branding-boot="loading"]')
    };
  })()`);
  if(!lookup.dormVisible || lookup.submitBg!==expectedRgb || !lookup.bootGone) throw new Error(`lookup branding invalid ${JSON.stringify(lookup)}`);
  if(expectLogo!==lookup.logoVisible) throw new Error(`lookup logo mismatch ${JSON.stringify(lookup)}`);

  const formResult=await evalJs(`(() => {
    const inputs=[...document.querySelectorAll('input')];
    const room=inputs.find(el => el.type==='text');
    const phone=inputs.find(el => el.type==='tel');
    const setValue=(el,value)=>{ const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
    if(!room||!phone) return {ok:false,reason:'inputs-missing'};
    setValue(room,${JSON.stringify(roomNumber)}); setValue(phone,${JSON.stringify(tenantPhone)});
    const form=room.closest('form'); if(!form)return {ok:false,reason:'form-missing'};
    form.requestSubmit(); return {ok:true,room:room.value,phone:phone.value};
  })()`);
  if(!formResult?.ok) throw new Error(`cannot submit tenant lookup ${JSON.stringify(formResult)}`);
  await waitFor(`[...document.querySelectorAll('h2')].some(el => (el.textContent||'').includes(${JSON.stringify(`ห้องพัก ${roomNumber}`)}))`,'active portal');
  const active=await evalJs(`(() => {
    const body=document.body.innerText||'';
    const logo=document.querySelector('img[alt=${JSON.stringify(`${expectedDorm} logo`)}]');
    const dorm=[...document.querySelectorAll('span')].find(el => (el.textContent||'').trim()===${JSON.stringify(expectedDorm)});
    const header=dorm?.closest('.bg-slate-900');
    return {
      roomVisible:body.includes(${JSON.stringify(`ห้องพัก ${roomNumber}`)}),
      dormVisible:!!dorm,
      dormColor:dorm?getComputedStyle(dorm).color:null,
      logoVisible:!!logo && getComputedStyle(logo).display!=='none',
      headerFound:!!header,
      successSemantic:!!document.querySelector('.bg-emerald-500'),
      repairSemantic:!!document.querySelector('.bg-amber-500')
    };
  })()`);
  if(!active.roomVisible || !active.dormVisible || active.dormColor!==expectedRgb || !active.headerFound) throw new Error(`active portal branding invalid ${JSON.stringify(active)}`);
  if(expectLogo!==active.logoVisible) throw new Error(`active logo mismatch ${JSON.stringify(active)}`);
  if(!active.successSemantic || !active.repairSemantic) throw new Error(`semantic markers missing ${JSON.stringify(active)}`);
  await writeFile(output, `${JSON.stringify({expectedDorm,expectedColor,expectLogo,lookup,active,overallPass:true},null,2)}\n`);
} finally {
  try{ws?.close();}catch{}
  if(proc.exitCode===null){ proc.kill('SIGTERM'); await Promise.race([new Promise(r=>proc.once('exit',r)),sleep(2000)]); }
  if(proc.exitCode===null)proc.kill('SIGKILL');
  await rm(profile,{recursive:true,force:true});
}
