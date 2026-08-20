from pathlib import Path
import json, sys, re

if len(sys.argv) != 3:
    raise SystemExit('usage: apply-v17-overlay.py MASTER_DIR CONTROL_PLANE_DIR')
master = Path(sys.argv[1])
cp = Path(sys.argv[2])

def write(root, rel, text):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')

def replace_once(path, old, new, label):
    p = Path(path); s = p.read_text(encoding='utf-8')
    n = s.count(old)
    if n != 1: raise RuntimeError(f'{label}: expected 1 anchor, got {n}')
    p.write_text(s.replace(old, new), encoding='utf-8')

UPDATE_CONTRACT = r'''import { createHash, webcrypto } from 'node:crypto';
export const UPDATE_MANIFEST_SCHEMA_VERSION = 1;
export const UPDATE_CHANNELS = Object.freeze(['stable']);
export const UPDATE_PLANS = Object.freeze(['demo','basic','standard','pro']);
export const UPDATE_MANIFEST_FIELDS = Object.freeze([
  'schemaVersion','product','version','channel','plan','packageSha256','packageSize','migrationCeiling','minimumSupportedVersion','releaseNotes','downloadUrl','publishedAt'
]);
function asString(v,k){ const s=String(v??'').trim(); if(!s)throw new Error(`Missing ${k}`); return s; }
export function parseSemver(v){ const m=String(v||'').trim().match(/^(\d+)\.(\d+)\.(\d+)$/); if(!m)throw new Error(`Invalid semver: ${v}`); return m.slice(1).map(Number); }
export function compareSemver(a,b){ const x=parseSemver(a),y=parseSemver(b); for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1;} return 0; }
export function normalizeUpdateManifest(input){
  const m={
    schemaVersion:Number(input?.schemaVersion), product:asString(input?.product,'product'), version:asString(input?.version,'version'),
    channel:asString(input?.channel,'channel'), plan:asString(input?.plan,'plan'), packageSha256:asString(input?.packageSha256,'packageSha256').toLowerCase(),
    packageSize:Number(input?.packageSize), migrationCeiling:asString(input?.migrationCeiling,'migrationCeiling'), minimumSupportedVersion:asString(input?.minimumSupportedVersion,'minimumSupportedVersion'),
    releaseNotes:String(input?.releaseNotes??''), downloadUrl:asString(input?.downloadUrl,'downloadUrl'), publishedAt:asString(input?.publishedAt,'publishedAt')
  };
  if(m.schemaVersion!==1)throw new Error('Unsupported update manifest schema');
  if(m.product!=='dorm-management-system')throw new Error('Wrong update product');
  parseSemver(m.version); parseSemver(m.minimumSupportedVersion);
  if(!UPDATE_CHANNELS.includes(m.channel))throw new Error('Unsupported update channel');
  if(!UPDATE_PLANS.includes(m.plan))throw new Error('Unsupported update plan');
  if(!/^[a-f0-9]{64}$/.test(m.packageSha256))throw new Error('Invalid package SHA-256');
  if(!Number.isSafeInteger(m.packageSize)||m.packageSize<=0)throw new Error('Invalid package size');
  if(!/^000\d+_[a-z0-9_]+\.sql$/.test(m.migrationCeiling))throw new Error('Invalid migration ceiling');
  const u=new URL(m.downloadUrl); if(u.protocol!=='https:')throw new Error('Update URL must use HTTPS');
  if(!Number.isFinite(Date.parse(m.publishedAt)))throw new Error('Invalid publishedAt');
  return m;
}
export function canonicalUpdateManifest(input){ const m=normalizeUpdateManifest(input); return JSON.stringify(Object.fromEntries(UPDATE_MANIFEST_FIELDS.map(k=>[k,m[k]]))); }
function b64(v){return Uint8Array.from(Buffer.from(String(v).replace(/-/g,'+').replace(/_/g,'/'),'base64'));}
export async function verifyUpdateManifestSignature(manifest, signatureBase64, publicKeyBase64){
  const key=await webcrypto.subtle.importKey('raw',b64(publicKeyBase64),{name:'Ed25519'},false,['verify']);
  const ok=await webcrypto.subtle.verify('Ed25519',key,b64(signatureBase64),new TextEncoder().encode('dorm-update-manifest-v1\n'+canonicalUpdateManifest(manifest)));
  if(!ok)throw new Error('UPDATE_SIGNATURE_INVALID'); return true;
}
export function assertUpdatePolicy({manifest,currentVersion,licensePlan,channel='stable'}){
  const m=normalizeUpdateManifest(manifest); const plan=String(licensePlan||'').toLowerCase();
  if(m.channel!==channel)throw new Error('UPDATE_CHANNEL_MISMATCH');
  if(m.plan!==plan)throw new Error('UPDATE_PLAN_MISMATCH');
  if(compareSemver(currentVersion,m.minimumSupportedVersion)<0)throw new Error('UPDATE_CURRENT_VERSION_TOO_OLD');
  if(compareSemver(m.version,currentVersion)<=0)throw new Error('UPDATE_DOWNGRADE_OR_REPLAY');
  return m;
}
export function sha256Bytes(bytes){return createHash('sha256').update(bytes).digest('hex');}
'''

UPDATE_PACKAGE = r'''import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import process from 'node:process';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { assertUpdatePolicy, sha256Bytes, verifyUpdateManifestSignature } from './scripts/update-contract.mjs';
import { readDeploymentConfig, commandUsesShell, wranglerInvocation } from './scripts/plan-upgrade.mjs';
import { projectUrlsFromList } from './SETUP-CLOUDFLARE.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url));
const CONFIG=resolve(ROOT,'wrangler.jsonc');
const STATE=resolve(ROOT,'.dorm-update-state.json');
function command(bin,args,{cwd=ROOT,capture=false,env=process.env}={}){const r=spawnSync(bin,args,{cwd,encoding:'utf8',stdio:capture?['ignore','pipe','pipe']:'inherit',shell:commandUsesShell(bin),env});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${bin} ${args.join(' ')} failed\n${r.stderr||''}`);return capture?String(r.stdout||''):'';}
function npm(args,o={}){return command(process.platform==='win32'?'npm.cmd':'npm',args,o)}
function node(args,o={}){return command(process.execPath,args,o)}
function wrangler(args,o={}){const i=wranglerInvocation({root:o.cwd||ROOT,nodeExecutable:process.execPath,platform:process.platform,exists:existsSync});return command(i.bin,[...i.prefix,...args],o)}
function parseJsonOutput(text){const s=String(text||'');for(let i=0;i<s.length;i++)if(s[i]==='['||s[i]==='{')try{return JSON.parse(s.slice(i))}catch{} throw new Error('Cannot parse Wrangler JSON');}
function readPublicConfig(){const s=readFileSync(resolve(ROOT,'src/generated/licenseConfig.ts'),'utf8');const get=(k)=>s.match(new RegExp(`${k}:\\s*['\"]([^'\"]*)['\"]`))?.[1]||'';return {plan:get('packagePlan'),publicKey:get('publicKeyBase64'),controlPlaneUrl:get('controlPlaneUrl').replace(/\/+$/,'')};}
function currentVersion(){if(existsSync(STATE)){try{return JSON.parse(readFileSync(STATE,'utf8')).currentVersion||JSON.parse(readFileSync(resolve(ROOT,'package.json'),'utf8')).version}catch{}}return JSON.parse(readFileSync(resolve(ROOT,'package.json'),'utf8')).version;}
function licenseState(){const sql='SELECT installation_id,signed_token,status,effective_plan FROM license_state WHERE id=1 LIMIT 1;';const x=parseJsonOutput(wrangler(['d1','execute','DB','--remote','--json','--command',sql],{capture:true}));const rows=[];const walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(Object.hasOwn(v,'installation_id'))rows.push(v);Object.values(v).forEach(walk)}};walk(x);return rows[0]||{};}
async function fetchRetry(url,options={},attempts=5){let last;for(let i=0;i<attempts;i++){try{const r=await fetch(url,options);if(r.ok)return r;last=new Error(`HTTP ${r.status}`)}catch(e){last=e}await new Promise(r=>setTimeout(r,500*(i+1)));}throw last||new Error('Network error');}
function safeExtract(bytes,dest){rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});const files=unzipSync(new Uint8Array(bytes));for(const [name,data] of Object.entries(files)){if(!name||name.startsWith('/')||name.includes('..'))throw new Error('Unsafe ZIP path');const p=resolve(dest,name);if(!p.startsWith(resolve(dest)+process.platform==='win32'?'\\':'/')){}mkdirSync(dirname(p),{recursive:true});writeFileSync(p,Buffer.from(data));}}
async function projectUrl(projectName){const x=parseJsonOutput(wrangler(['pages','project','list','--json'],{capture:true}));const urls=projectUrlsFromList(x,projectName);if(!urls.length)throw new Error('Cannot resolve Pages URL');return urls[0].replace(/\/+$/,'');}
async function loginAndBackup(base,ask,version){const username=String(process.env.DORM_UPDATE_ADMIN_USERNAME||await ask('Owner username/email: ')).trim();const password=String(process.env.DORM_UPDATE_ADMIN_PASSWORD||await ask('Owner password: '));if(!username||!password)throw new Error('Owner credentials required for automatic .dormbackup');let r=await fetchRetry(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});let b=await r.json();const token=b?.data?.token||b?.token;if(!token)throw new Error('Login did not return token');r=await fetchRetry(`${base}/api/admin/backup/export`,{headers:{Authorization:`Bearer ${token}`}});b=await r.json();const payload=b?.data||b;if(!payload?.manifest||!payload?.data)throw new Error('Invalid backup export');const out=resolve(ROOT,'backups',`pre-update-${new Date().toISOString().replace(/[:.]/g,'-')}-${version}.dormbackup`);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,Buffer.from(zipSync({'manifest.json':strToU8(JSON.stringify(payload.manifest)),'data.json':strToU8(JSON.stringify(payload.data))},{level:9})));r=await fetchRetry(`${base}/api/admin/backup/validate`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});b=await r.json();if(!r.ok||!b?.success)throw new Error('Automatic .dormbackup validation failed');return {path:out,token,payload,restoreToken:b?.data?.restoreToken||b?.restoreToken||null};}
async function restoreBackup(base,b){if(!b?.token||!b?.restoreToken)return false;const r=await fetch(`${base}/api/admin/backup/restore`,{method:'POST',headers:{Authorization:`Bearer ${b.token}`,'content-type':'application/json'},body:JSON.stringify({...b.payload,restoreToken:b.restoreToken,confirmation:'RESTORE'})});return r.ok;}
export async function runUpdateWorkflow({ask}){if(!existsSync(CONFIG))throw new Error('wrangler.jsonc is required');const config=readDeploymentConfig(readFileSync(CONFIG,'utf8'));wrangler(['whoami'],{capture:true});npm(['run','customer:preflight']);const local=readPublicConfig();const ls=licenseState();const isDemo=local.plan==='demo';if(!isDemo&&(!ls.installation_id||!ls.signed_token))throw new Error('LICENSE_REQUIRED');const check=await fetchRetry(`${local.controlPlaneUrl}/v1/updates/check`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:String(ls.signed_token||''),installationId:String(ls.installation_id||''),currentVersion:currentVersion(),channel:'stable',demo:isDemo})});const body=await check.json();if(!body?.manifest||!body?.signature)throw new Error('Invalid update response');await verifyUpdateManifestSignature(body.manifest,body.signature,local.publicKey);const manifest=assertUpdatePolicy({manifest:body.manifest,currentVersion:currentVersion(),licensePlan:String(body.licensePlan||local.plan),channel:'stable'});const bytes=Buffer.from(await (await fetchRetry(manifest.downloadUrl)).arrayBuffer());if(bytes.length!==manifest.packageSize)throw new Error('UPDATE_SIZE_MISMATCH');if(sha256Bytes(bytes)!==manifest.packageSha256)throw new Error('UPDATE_SHA256_MISMATCH');const base=await projectUrl(config.projectName);const appBackup=await loginAndBackup(base,ask,currentVersion());const sqlBackup=resolve(ROOT,'backups',`pre-update-${Date.now()}.sql`);node(['scripts/d1-export.mjs','--remote',sqlBackup]);npm(['ci']);npm(['run','build:pages']);const oldDist=resolve(ROOT,'.dorm-update-rollback-dist');rmSync(oldDist,{recursive:true,force:true});cpSync(resolve(ROOT,'dist'),oldDist,{recursive:true});const staging=resolve(ROOT,'.dorm-update-staging',manifest.version);safeExtract(bytes,staging);cpSync(CONFIG,resolve(staging,'wrangler.jsonc'));for(const f of ['.env','.dev.vars'])if(existsSync(resolve(ROOT,f)))cpSync(resolve(ROOT,f),resolve(staging,f));let deployed=false;try{npm(['ci'],{cwd:staging});npm(['run','customer:preflight'],{cwd:staging});npm(['run','release:check'],{cwd:staging});npm(['run','d1:migrate:remote'],{cwd:staging});npm(['run','build:pages'],{cwd:staging});wrangler(['pages','deploy','dist','--project-name',config.projectName],{cwd:staging});deployed=true;const healthy=await fetchRetry(`${base}/`,{},8);if(!healthy.ok)throw new Error('UPDATE_HEALTH_FAILED');wrangler(['d1','execute','DB','--remote','--json','--command',`INSERT INTO update_state(id,channel,last_checked_at,latest_version,last_success_version,last_error_code,last_error_message,update_requested_at,updated_at) VALUES(1,'stable',CURRENT_TIMESTAMP,'${manifest.version}','${manifest.version}',NULL,NULL,NULL,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET last_checked_at=CURRENT_TIMESTAMP,latest_version='${manifest.version}',last_success_version='${manifest.version}',last_error_code=NULL,last_error_message=NULL,update_requested_at=NULL,updated_at=CURRENT_TIMESTAMP;`],{cwd:staging,capture:true});writeFileSync(STATE,JSON.stringify({currentVersion:manifest.version,channel:'stable',updatedAt:new Date().toISOString(),manifest},null,2));return {updated:true,fromVersion:currentVersion(),toVersion:manifest.version,backup:appBackup.path,sqlBackup};}catch(e){if(deployed)wrangler(['pages','deploy',oldDist,'--project-name',config.projectName]);await restoreBackup(base,appBackup).catch(()=>false);throw e;}}
export async function main(){const rl=readline.createInterface({input:process.stdin,output:process.stdout});try{const result=await runUpdateWorkflow({ask:q=>rl.question(q)});console.log(`Update สำเร็จ → ${result.toVersion}`);}finally{rl.close();}}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))main().catch(e=>{console.error(`UPDATE FAILED: ${e instanceof Error?e.message:String(e)}`);process.exitCode=1});
'''

AUTO_UPDATE_UI = r'''import React,{useEffect,useState} from 'react';
import { RefreshCw, Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { unwrapApiData, readApiError } from '../utils/api.ts';
export function AutoUpdateSettings({idToken,role}:{idToken?:string|null;role?:string}){
 const allowed=['owner','super_admin'].includes(String(role||'')); const [s,setS]=useState<any>(null); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
 const check=async()=>{if(!idToken||!allowed)return;setBusy(true);setMsg('');try{const r=await fetch('/api/admin/update/status',{headers:{Authorization:`Bearer ${idToken}`}});if(!r.ok)throw new Error(await readApiError(r,'ตรวจสอบอัปเดตไม่สำเร็จ'));setS(unwrapApiData(await r.json()));}catch(e){setMsg(e instanceof Error?e.message:'ตรวจสอบอัปเดตไม่สำเร็จ')}finally{setBusy(false)}};
 useEffect(()=>{void check()},[idToken,allowed]); if(!allowed)return null;
 const request=async()=>{setBusy(true);setMsg('');try{const r=await fetch('/api/admin/update/request',{method:'POST',headers:{Authorization:`Bearer ${idToken}`}});if(!r.ok)throw new Error(await readApiError(r,'เริ่มคำขออัปเดตไม่สำเร็จ'));const d=unwrapApiData<any>(await r.json());setMsg(`พร้อมอัปเดต: รัน ${d.launcherWindows} บน Windows หรือ ${d.launcherAndroid} บน Android/Termux`);await check();}catch(e){setMsg(e instanceof Error?e.message:'เริ่มคำขออัปเดตไม่สำเร็จ')}finally{setBusy(false)}};
 return <div className="bg-white border border-[#E0E0DB] rounded-2xl p-6 space-y-4 text-xs"><div><h3 className="text-sm font-bold text-[#1A1A1A] flex gap-2 items-center"><RefreshCw className="w-4 h-4 text-[#1DB954]"/>Auto Update</h3><p className="text-[11px] text-[#6B6B66] mt-1">ตรวจ signed manifest จาก Control Plane และอัปเดตด้วยแพ็กเกจที่ตรงกับ License เท่านั้น</p></div>{s&&<div className="grid grid-cols-2 gap-2 text-[11px]"><div>Current: <b>{s.currentVersion}</b></div><div>Latest: <b>{s.latestVersion||'-'}</b></div><div>Channel: <b>{s.channel||'stable'}</b></div><div>Migration: <b>{s.migrationCeiling||'-'}</b></div></div>}{s?.releaseNotes&&<div className="p-3 bg-[#F0F0EB] rounded-xl whitespace-pre-wrap">{s.releaseNotes}</div>}{msg&&<div className="p-3 border rounded-xl flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/>{msg}</div>}<div className="flex gap-2"><button type="button" onClick={()=>void check()} disabled={busy} className="px-4 py-2 rounded-xl border border-[#E0E0DB] font-bold">Check for updates</button><button type="button" onClick={()=>void request()} disabled={busy||!s?.updateAvailable} className="px-4 py-2 rounded-xl bg-[#1DB954] text-white font-bold disabled:opacity-50 flex gap-2 items-center"><Download className="w-4 h-4"/>Update now</button></div><div className="flex gap-2 text-[10px] text-[#6B6B66]"><ShieldCheck className="w-4 h-4 text-[#1DB954]"/>ระบบไม่แสดง License token, private key หรือ Cloudflare secret บนหน้านี้</div></div>;
}
'''

UPDATE_TEST = r'''import test from 'node:test'; import assert from 'node:assert/strict'; import { generateKeyPairSync, sign } from 'node:crypto';
import { canonicalUpdateManifest,compareSemver,assertUpdatePolicy,verifyUpdateManifestSignature,sha256Bytes } from '../scripts/update-contract.mjs';
const M={schemaVersion:1,product:'dorm-management-system',version:'1.2.0',channel:'stable',plan:'basic',packageSha256:'a'.repeat(64),packageSize:123,migrationCeiling:'0008_add_update_state.sql',minimumSupportedVersion:'1.1.0',releaseNotes:'V17',downloadUrl:'https://example.invalid/basic.zip',publishedAt:'2026-08-20T00:00:00.000Z'};
test('manifest canonical contract is stable',()=>{assert.equal(canonicalUpdateManifest(M),JSON.stringify(M));assert.equal(compareSemver('1.2.0','1.1.9'),1)});
test('policy rejects downgrade, wrong plan, and too-old base',()=>{assert.equal(assertUpdatePolicy({manifest:M,currentVersion:'1.1.0',licensePlan:'basic'}).version,'1.2.0');assert.throws(()=>assertUpdatePolicy({manifest:M,currentVersion:'1.2.0',licensePlan:'basic'}),/DOWNGRADE/);assert.throws(()=>assertUpdatePolicy({manifest:M,currentVersion:'1.1.0',licensePlan:'pro'}),/PLAN_MISMATCH/);assert.throws(()=>assertUpdatePolicy({manifest:{...M,minimumSupportedVersion:'1.1.1'},currentVersion:'1.1.0',licensePlan:'basic'}),/TOO_OLD/)});
test('Ed25519 signature verifies and tampering fails',async()=>{const {privateKey,publicKey}=generateKeyPairSync('ed25519');const jwk=publicKey.export({format:'jwk'});const raw=Buffer.from(jwk.x.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-jwk.x.length%4)%4),'base64');const sig=sign(null,Buffer.from('dorm-update-manifest-v1\n'+canonicalUpdateManifest(M)),privateKey).toString('base64url');await verifyUpdateManifestSignature(M,sig,raw.toString('base64'));await assert.rejects(()=>verifyUpdateManifestSignature({...M,version:'1.2.1'},sig,raw.toString('base64')))});
test('package hash is deterministic',()=>assert.equal(sha256Bytes(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
'''

MIGRATION = r'''CREATE TABLE IF NOT EXISTS update_state (
 id INTEGER PRIMARY KEY CHECK (id = 1), channel TEXT NOT NULL DEFAULT 'stable', last_checked_at TEXT, latest_version TEXT,
 last_success_version TEXT, last_error_code TEXT, last_error_message TEXT, update_requested_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO update_state(id,channel,updated_at) VALUES(1,'stable',CURRENT_TIMESTAMP);
'''

CP_SIGNING = r'''export type UpdateManifest={schemaVersion:1;product:'dorm-management-system';version:string;channel:string;plan:'demo'|'basic'|'standard'|'pro';packageSha256:string;packageSize:number;migrationCeiling:string;minimumSupportedVersion:string;releaseNotes:string;downloadUrl:string;publishedAt:string};
export function canonicalUpdateManifest(m:UpdateManifest){return JSON.stringify({schemaVersion:m.schemaVersion,product:m.product,version:m.version,channel:m.channel,plan:m.plan,packageSha256:m.packageSha256,packageSize:m.packageSize,migrationCeiling:m.migrationCeiling,minimumSupportedVersion:m.minimumSupportedVersion,releaseNotes:m.releaseNotes,downloadUrl:m.downloadUrl,publishedAt:m.publishedAt})}
function bytesToB64u(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64(v:string){const n=v.replace(/-/g,'+').replace(/_/g,'/');const p=n+'='.repeat((4-n.length%4)%4);const s=atob(p);return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function key(input:string){let s=input.trim();if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'")))s=s.slice(1,-1).trim();if(/^V16_LICENSE_SIGNING_PRIVATE_KEY\s*=/.test(s))s=s.replace(/^V16_LICENSE_SIGNING_PRIVATE_KEY\s*=\s*/,'').trim();if(s.includes('BEGIN PRIVATE KEY'))s=s.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');return crypto.subtle.importKey('pkcs8',b64(s),{name:'Ed25519'},false,['sign'])}
export async function signUpdateManifest(m:UpdateManifest,privateKey:string){const k=await key(privateKey);const sig=await crypto.subtle.sign('Ed25519',k,new TextEncoder().encode('dorm-update-manifest-v1\n'+canonicalUpdateManifest(m)));return bytesToB64u(new Uint8Array(sig))}
'''

CP_SERVICE = r'''import { LicenseError, refreshLicense, type ControlPlaneEnv } from './license.service.ts'; import { signUpdateManifest, type UpdateManifest } from './update-signing.ts';
type ReleaseRow={version:string;channel:string;plan:'demo'|'basic'|'standard'|'pro';package_url:string;package_sha256:string;package_size:number;migration_ceiling:string;minimum_supported_version:string;release_notes:string;published_at:string};
function cmp(a:string,b:string){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1}return 0}
export async function checkForUpdate(env:ControlPlaneEnv,input:{token?:string;installationId?:string;currentVersion?:string;channel?:string;demo?:boolean},nowMs=Date.now()){
 const channel=String(input.channel||'stable'); if(channel!=='stable')throw new LicenseError('UPDATE_CHANNEL_INVALID','Unsupported update channel.',400);
 let plan:'demo'|'basic'|'standard'|'pro'; let licenseId:string|null=null;
 if(input.demo===true&&!input.token){plan='demo'}else{const r=await refreshLicense(env,{token:String(input.token||''),installationId:String(input.installationId||'')},nowMs);plan=r.payload.plan;licenseId=r.payload.licenseId;}
 const row=await env.DB.prepare('SELECT version,channel,plan,package_url,package_sha256,package_size,migration_ceiling,minimum_supported_version,release_notes,published_at FROM update_releases WHERE channel=? AND plan=? AND active=1 ORDER BY published_at DESC LIMIT 1').bind(channel,plan).first<ReleaseRow>();
 if(!row)throw new LicenseError('UPDATE_NOT_PUBLISHED','No update is published for this plan.',404);
 if(licenseId)await env.DB.prepare('INSERT INTO license_events(license_id,installation_id,kind,ip_hash,user_agent_hash,created_at) VALUES(?,?,?,NULL,NULL,?)').bind(licenseId,String(input.installationId||''),'update_check',new Date(nowMs).toISOString()).run();
 const manifest:UpdateManifest={schemaVersion:1,product:'dorm-management-system',version:row.version,channel:row.channel,plan:row.plan,packageSha256:row.package_sha256,packageSize:Number(row.package_size),migrationCeiling:row.migration_ceiling,minimumSupportedVersion:row.minimum_supported_version,releaseNotes:row.release_notes,downloadUrl:row.package_url,publishedAt:row.published_at};
 return {updateAvailable:cmp(manifest.version,String(input.currentVersion||'0.0.0'))>0,licensePlan:plan,manifest,signature:await signUpdateManifest(manifest,env.LICENSE_SIGNING_PRIVATE_KEY)};
}
'''

CP_MIGRATION = r'''CREATE TABLE IF NOT EXISTS update_releases (
 id TEXT PRIMARY KEY, channel TEXT NOT NULL, plan TEXT NOT NULL CHECK(plan IN ('demo','basic','standard','pro')), version TEXT NOT NULL,
 package_url TEXT NOT NULL, package_sha256 TEXT NOT NULL, package_size INTEGER NOT NULL, migration_ceiling TEXT NOT NULL,
 minimum_supported_version TEXT NOT NULL, release_notes TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_update_releases_active ON update_releases(channel,plan,active,published_at);
'''

CP_TEST = r'''import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';import {canonicalUpdateManifest,signUpdateManifest} from '../src/update-signing.ts';
test('update manifest canonical order and signing are deterministic shape',async()=>{const {privateKey}=generateKeyPairSync('ed25519');const der=privateKey.export({format:'der',type:'pkcs8'}).toString('base64');const m={schemaVersion:1,product:'dorm-management-system',version:'1.2.0',channel:'stable',plan:'pro',packageSha256:'a'.repeat(64),packageSize:1,migrationCeiling:'0008_add_update_state.sql',minimumSupportedVersion:'1.1.0',releaseNotes:'V17',downloadUrl:'https://example.invalid/pro.zip',publishedAt:'2026-08-20T00:00:00.000Z'} as const;assert.match(canonicalUpdateManifest(m),/^\{"schemaVersion":1,/);assert.ok((await signUpdateManifest(m,der)).length>40)});
'''

write(master,'scripts/update-contract.mjs',UPDATE_CONTRACT)
write(master,'UPDATE-PACKAGE.mjs',UPDATE_PACKAGE)
write(master,'UPDATE-WINDOWS.cmd','@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nnode UPDATE-PACKAGE.mjs\r\nset "EXIT_CODE=%ERRORLEVEL%"\r\npause\r\nexit /b %EXIT_CODE%\r\n')
write(master,'UPDATE-ANDROID.sh','#!/data/data/com.termux/files/usr/bin/bash\nset -e\ncd "$(dirname "$0")"\nnode UPDATE-PACKAGE.mjs\n')
write(master,'src/components/AutoUpdateSettings.tsx',AUTO_UPDATE_UI)
write(master,'tests/update-contract.test.mjs',UPDATE_TEST)
write(master,'d1-migrations/0008_add_update_state.sql',MIGRATION)
write(master,'RELEASE_NOTES_V17_TH.md','# V17 — Auto Update\n\n- Signed update manifest\n- License-aware plan delivery\n- Automatic pre-update .dormbackup + SQL backup\n- Staged Cloudflare Pages deployment and rollback\n- Admin Update status/request UI\n- Stable Control Plane update service\n')

# Version + scripts
pkg_path=master/'package.json'; pkg=json.loads(pkg_path.read_text())
pkg['version']='1.2.0'
pkg['scripts']['update:package']='node UPDATE-PACKAGE.mjs'
pkg['scripts']['test:update']='node --test tests/update-contract.test.mjs'
if 'npm run test:update' not in pkg['scripts']['test']:
    pkg['scripts']['test'] += ' && npm run test:update'
pkg_path.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
lock_path=master/'package-lock.json'
if lock_path.exists():
    lock=json.loads(lock_path.read_text()); lock['version']='1.2.0'
    if isinstance(lock.get('packages'),dict) and '' in lock['packages']: lock['packages']['']['version']='1.2.0'
    lock_path.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')

# Settings UI integration
settings=master/'src/components/SettingsView.tsx'; s=settings.read_text()
anchor="import { LicenseSettings } from './LicenseSettings.tsx';"
if s.count(anchor)!=1: raise RuntimeError('SettingsView import anchor mismatch')
s=s.replace(anchor,anchor+"\nimport { AutoUpdateSettings } from './AutoUpdateSettings.tsx';")
block=""" <BackupRestoreSettings
 idToken={idToken}
 subscriptionPlan={subscriptionPlan}
 role={role}
 showToast={showToast}
 onRestoreSuccess={onRestoreSuccess}
 />"""
if s.count(block)!=1: raise RuntimeError(f'SettingsView backup block mismatch {s.count(block)}')
s=s.replace(block,block+"\n\n <AutoUpdateSettings idToken={idToken} role={role} />")
settings.write_text(s)

# Pages update API: insert before subscription metadata helper.
api=master/'functions/api/[[path]].ts'; s=api.read_text()
anchor='    async function getSubscriptionMetadata(ownerId: number) {'
if s.count(anchor)!=1: raise RuntimeError('Pages update insertion anchor mismatch')
route=r'''    async function fetchLatestUpdateForOwner(ownerId: number) {
      let state = await resolveLicenseState(env, ownerId);
      if (state.token && state.token.refreshAfter * 1000 <= Date.now()) {
        try { state = await maybeRefreshCustomerLicense(env, { projectName: new URL(request.url).hostname, hostname: new URL(request.url).hostname, appVersion: APP_VERSION }); } catch { state = await resolveLicenseState(env, ownerId); }
      }
      const isDemo = state.effectivePlan === 'demo' && !state.signedToken;
      if (!isDemo && (!state.signedToken || !state.installationId)) throw new LicenseOperationError('LICENSE_REQUIRED', 'ต้อง Activate License ก่อนตรวจสอบอัปเดต', 409);
      const base = String(state.controlPlaneUrl || '').replace(/\/+$/, '');
      if (!base) throw new LicenseOperationError('CONTROL_PLANE_UNAVAILABLE', 'ยังไม่ได้ตั้งค่า Control Plane', 503);
      let response: Response;
      try { response = await fetch(`${base}/v1/updates/check`, { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ token: state.signedToken || '', installationId: state.installationId || '', currentVersion: APP_VERSION, channel: 'stable', demo: isDemo }) }); }
      catch { throw new LicenseOperationError('CONTROL_PLANE_UNAVAILABLE', 'ไม่สามารถเชื่อมต่อ Update Service ได้', 503); }
      const body: any = await response.json().catch(() => null);
      if (!response.ok) throw new LicenseOperationError(String(body?.error?.code || 'UPDATE_CHECK_FAILED'), String(body?.error?.message || 'ตรวจสอบอัปเดตไม่สำเร็จ'), response.status);
      if (!body?.manifest || !body?.signature) throw new LicenseOperationError('UPDATE_RESPONSE_INVALID', 'Update Service ส่งข้อมูลไม่ถูกต้อง', 502);
      if (env.DB) await env.DB.prepare(`INSERT INTO update_state(id,channel,last_checked_at,latest_version,updated_at) VALUES(1,'stable',CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET last_checked_at=CURRENT_TIMESTAMP,latest_version=excluded.latest_version,updated_at=CURRENT_TIMESTAMP`).bind(String(body.manifest.version || '')).run();
      return body;
    }

    if (path === '/api/admin/update/status' && method === 'GET') {
      const gate = await requireLicenseOwner(); if (gate.response) return gate.response;
      try { const ownerId = Number(gate.authUser.effectiveUserId || gate.authUser.id); const body: any = await fetchLatestUpdateForOwner(ownerId); const m=body.manifest; let local:any=null; if(env.DB) local=await env.DB.prepare('SELECT last_checked_at,last_success_version,last_error_code,last_error_message,update_requested_at FROM update_state WHERE id=1').first(); return successResponse({ currentVersion: APP_VERSION, latestVersion:m.version, updateAvailable:Boolean(body.updateAvailable), channel:m.channel, plan:m.plan, migrationCeiling:m.migrationCeiling, minimumSupportedVersion:m.minimumSupportedVersion, releaseNotes:m.releaseNotes, publishedAt:m.publishedAt, lastCheckedAt:local?.last_checked_at||null, lastSuccessfulUpdate:local?.last_success_version||null, lastErrorCode:local?.last_error_code||null, lastErrorMessage:local?.last_error_message||null, updateRequestedAt:local?.update_requested_at||null }); }
      catch(error:any){ if(error instanceof LicenseOperationError)return errorResponse(error.code,error.message,error.status); return errorResponse('UPDATE_CHECK_FAILED','ตรวจสอบอัปเดตไม่สำเร็จ',500); }
    }

    if (path === '/api/admin/update/request' && method === 'POST') {
      const gate = await requireLicenseOwner(); if (gate.response) return gate.response; if(!env.DB)return errorResponse('DATABASE_ERROR','ไม่พบการเชื่อมต่อฐานข้อมูล D1',500);
      try { const ownerId=Number(gate.authUser.effectiveUserId||gate.authUser.id); const body:any=await fetchLatestUpdateForOwner(ownerId); if(!body.updateAvailable)return errorResponse('UPDATE_NOT_AVAILABLE','ไม่มีเวอร์ชันใหม่',409); await env.DB.prepare(`INSERT INTO update_state(id,channel,last_checked_at,latest_version,update_requested_at,updated_at) VALUES(1,'stable',CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET last_checked_at=CURRENT_TIMESTAMP,latest_version=excluded.latest_version,update_requested_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(String(body.manifest.version||'')).run(); return successResponse({requested:true,latestVersion:body.manifest.version,launcherWindows:'UPDATE-WINDOWS.cmd',launcherAndroid:'UPDATE-ANDROID.sh'},'บันทึกคำขออัปเดตแล้ว'); }
      catch(error:any){ if(error instanceof LicenseOperationError)return errorResponse(error.code,error.message,error.status); return errorResponse('UPDATE_REQUEST_FAILED','เริ่มคำขออัปเดตไม่สำเร็จ',500); }
    }

'''
s=s.replace(anchor,route+anchor)
api.write_text(s)

# Customer-facing builder labels become V17 while keeping plan logic.
builder=master/'scripts/build-packages.mjs'; bs=builder.read_text()
for old,new in [('Customer Delivery V14','Customer Delivery V17'),('PREVIEW V14','PREVIEW V17'),('V14 Master Package Builder','V17 Master Package Builder'),('Upgrade Manager V14','Upgrade Manager V17'),('V14 release engineering','V17 release engineering'),('RELEASE_NOTES_V14_TH.md','RELEASE_NOTES_V17_TH.md')]: bs=bs.replace(old,new)
builder.write_text(bs)

# Control Plane update service
write(cp,'src/update-signing.ts',CP_SIGNING)
write(cp,'src/update.service.ts',CP_SERVICE)
write(cp,'migrations/0002_update_releases.sql',CP_MIGRATION)
write(cp,'tests/update-signing.test.ts',CP_TEST)
idx=cp/'src/index.ts'; isrc=idx.read_text()
old="import { activateLicense, deactivateLicense, LicenseError, refreshLicense, type ControlPlaneEnv } from './license.service.ts';"
if isrc.count(old)!=1: raise RuntimeError('CP import anchor mismatch')
isrc=isrc.replace(old,old+"\nimport { checkForUpdate } from './update.service.ts';")
anchor="  return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);"
if isrc.count(anchor)!=1: raise RuntimeError('CP route anchor mismatch')
route="""  if (path === '/v1/updates/check') {
    const result = await checkForUpdate(env, { token: String(body.token || ''), installationId: String(body.installationId || ''), currentVersion: String(body.currentVersion || ''), channel: String(body.channel || 'stable'), demo: body.demo === true });
    return json(result);
  }
"""
isrc=isrc.replace(anchor,route+anchor)
idx.write_text(isrc)

# Contract/design document in Master
write(master,'V17_UPDATE_CONTRACT.md','''# V17 Auto Update Contract\n\n- schemaVersion: 1\n- channel: stable\n- plans: demo/basic/standard/pro\n- signed fields: version, plan, SHA-256, package size, migration ceiling, minimum supported version, release notes, HTTPS download URL, published time\n- Ed25519 domain separation: `dorm-update-manifest-v1\\n`\n- paid plan authority: current signed license from Control Plane\n- Demo: separately published signed Demo release\n- downgrade/replay and wrong-plan manifests are rejected\n- V16 immutable baseline: artifact 9393238249 / sha256 fe17d6426d66722068fd2d003590ca3d0ef188d19dca33c58ed6200ed2de85f1\n- V16 migration ceiling: 0007_add_license_state.sql\n- V17 migration ceiling: 0008_add_update_state.sql\n''')

print('V17 overlay applied')
