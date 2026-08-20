from pathlib import Path
import sys
if len(sys.argv)!=2: raise SystemExit('usage: harden-v17-overlay.py MASTER_DIR')
root=Path(sys.argv[1]); p=root/'UPDATE-PACKAGE.mjs'; s=p.read_text()
old="function safeExtract(bytes,dest){rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});const files=unzipSync(new Uint8Array(bytes));for(const [name,data] of Object.entries(files)){if(!name||name.startsWith('/')||name.includes('..'))throw new Error('Unsafe ZIP path');const p=resolve(dest,name);if(!p.startsWith(resolve(dest)+process.platform==='win32'?'\\\\':'/')){}mkdirSync(dirname(p),{recursive:true});writeFileSync(p,Buffer.from(data));}}"
new="function safeExtract(bytes,dest){rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});const root=resolve(dest);const sep=process.platform==='win32'?'\\\\':'/';const files=unzipSync(new Uint8Array(bytes));for(const [name,data] of Object.entries(files)){if(!name||name.startsWith('/')||name.includes('..'))throw new Error('Unsafe ZIP path');const p=resolve(root,name);if(p!==root&&!p.startsWith(root+sep))throw new Error('Unsafe ZIP path');mkdirSync(dirname(p),{recursive:true});writeFileSync(p,Buffer.from(data));}}"
if old not in s: raise RuntimeError('safeExtract anchor missing')
s=s.replace(old,new)
old="async function loginAndBackup(base,ask,version){const username=String(process.env.DORM_UPDATE_ADMIN_USERNAME||await ask('Owner username/email: ')).trim();const password=String(process.env.DORM_UPDATE_ADMIN_PASSWORD||await ask('Owner password: '));if(!username||!password)throw new Error('Owner credentials required for automatic .dormbackup');"
new="async function loginAndBackup(base,ask,version){const directToken=String(process.env.DORM_UPDATE_ADMIN_TOKEN||'').trim();let token=directToken;if(!token){const username=String(process.env.DORM_UPDATE_ADMIN_USERNAME||await ask('Owner username/email: ')).trim();const password=String(process.env.DORM_UPDATE_ADMIN_PASSWORD||'');if(!username||!password)throw new Error('Set DORM_UPDATE_ADMIN_PASSWORD or DORM_UPDATE_ADMIN_TOKEN before update; password is never prompted visibly');let r=await fetchRetry(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});let loginBody=await r.json();token=loginBody?.data?.token||loginBody?.token;if(!token)throw new Error('Login did not return token');}"
if old not in s: raise RuntimeError('credential anchor missing')
s=s.replace(old,new)
old="let r=await fetchRetry(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});let b=await r.json();const token=b?.data?.token||b?.token;if(!token)throw new Error('Login did not return token');r=await fetchRetry(`${base}/api/admin/backup/export`,{headers:{Authorization:`Bearer ${token}`}});b=await r.json();"
new="let r=await fetchRetry(`${base}/api/admin/backup/export`,{headers:{Authorization:`Bearer ${token}`}});let b=await r.json();"
if old not in s: raise RuntimeError('login continuation anchor missing')
s=s.replace(old,new)
old="export async function runUpdateWorkflow({ask}){if(!existsSync(CONFIG))throw new Error('wrangler.jsonc is required');const config=readDeploymentConfig(readFileSync(CONFIG,'utf8'));"
new="export async function runUpdateWorkflow({ask}){if(!existsSync(CONFIG))throw new Error('wrangler.jsonc is required');const fromVersion=currentVersion();const config=readDeploymentConfig(readFileSync(CONFIG,'utf8'));"
if old not in s: raise RuntimeError('fromVersion anchor missing')
s=s.replace(old,new)
s=s.replace("currentVersion:currentVersion(),channel:'stable'","currentVersion:fromVersion,channel:'stable'")
s=s.replace("loginAndBackup(base,ask,currentVersion())","loginAndBackup(base,ask,fromVersion)")
s=s.replace("return {updated:true,fromVersion:currentVersion(),toVersion:manifest.version,backup:appBackup.path,sqlBackup};","return {updated:true,fromVersion,toVersion:manifest.version,backup:appBackup.path,sqlBackup};")
p.write_text(s)

# Add focused safety tests to the generated candidate.
t=root/'tests/update-updater-safety.test.mjs'
t.write_text("""import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';\nconst s=readFileSync(new URL('../UPDATE-PACKAGE.mjs',import.meta.url),'utf8');\ntest('staging extraction rejects traversal outside root',()=>{assert.match(s,/p!==root&&!p\\.startsWith\\(root\\+sep\\).*Unsafe ZIP path/)});\ntest('updater never visibly prompts for owner password',()=>{assert.doesNotMatch(s,/ask\\(['\"]Owner password/);assert.match(s,/DORM_UPDATE_ADMIN_PASSWORD/);assert.match(s,/DORM_UPDATE_ADMIN_TOKEN/)});\ntest('updater captures fromVersion before writing update state',()=>{assert.match(s,/const fromVersion=currentVersion\\(\\)/);assert.match(s,/return \\{updated:true,fromVersion,toVersion:/)});\n""")
# Ensure package test command runs safety tests.
import json
pkg=root/'package.json'; x=json.loads(pkg.read_text()); x['scripts']['test:update']='node --test tests/update-contract.test.mjs tests/update-updater-safety.test.mjs'; pkg.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
print('V17 updater hardening applied')
