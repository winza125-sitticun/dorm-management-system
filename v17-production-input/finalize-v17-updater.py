from pathlib import Path
import sys,json
if len(sys.argv)!=2: raise SystemExit('usage: finalize-v17-updater.py MASTER_DIR')
r=Path(sys.argv[1]); p=r/'UPDATE-PACKAGE.mjs'; s=p.read_text()
# Directory entries must not be written as regular files.
old="for(const [name,data] of Object.entries(files)){if(!name||name.startsWith('/')||name.includes('..'))throw new Error('Unsafe ZIP path');const p=resolve(root,name);if(p!==root&&!p.startsWith(root+sep))throw new Error('Unsafe ZIP path');mkdirSync(dirname(p),{recursive:true});writeFileSync(p,Buffer.from(data));}"
new="for(const [name,data] of Object.entries(files)){if(!name||name.startsWith('/')||name.includes('..'))throw new Error('Unsafe ZIP path');const p=resolve(root,name);if(p!==root&&!p.startsWith(root+sep))throw new Error('Unsafe ZIP path');if(name.endsWith('/')){mkdirSync(p,{recursive:true});continue;}mkdirSync(dirname(p),{recursive:true});writeFileSync(p,Buffer.from(data));}"
if old not in s: raise RuntimeError('safeExtract loop anchor missing')
s=s.replace(old,new)
# Add bounded local source snapshot/switch helpers after projectUrl.
anchor="async function projectUrl(projectName){const x=parseJsonOutput(wrangler(['pages','project','list','--json'],{capture:true}));const urls=projectUrlsFromList(x,projectName);if(!urls.length)throw new Error('Cannot resolve Pages URL');return urls[0].replace(/\\/+$/,'');}"
if anchor not in s: raise RuntimeError('projectUrl anchor missing')
helpers=anchor+"\n"+r'''const LOCAL_PRESERVE=new Set(['wrangler.jsonc','.env','.dev.vars','.dorm-update-state.json']);
function sourceSnapshotPath(version){return resolve(ROOT,'.dorm-update-previous-source',String(version).replace(/[^0-9A-Za-z._-]/g,'_'));}
function copyCustomerSource(src,dst,{preserveDest=false}={}){mkdirSync(dst,{recursive:true});for(const e of readdirSync(src,{withFileTypes:true})){if(['node_modules','dist','dist-server','backups','.dorm-update-staging','.dorm-update-previous-source','.dorm-update-rollback-dist'].includes(e.name))continue;if(preserveDest&&LOCAL_PRESERVE.has(e.name)&&existsSync(resolve(dst,e.name)))continue;const a=resolve(src,e.name),b=resolve(dst,e.name);if(e.isDirectory())copyCustomerSource(a,b,{preserveDest});else cpSync(a,b,{force:true});}}
function snapshotLocalSource(version){const out=sourceSnapshotPath(version);rmSync(out,{recursive:true,force:true});copyCustomerSource(ROOT,out);return out;}
function switchLocalSource(staging){copyCustomerSource(staging,ROOT,{preserveDest:true});}
function restoreLocalSource(snapshot,staging){const staged=walkRelativeFiles(staging);const old=walkRelativeFiles(snapshot);for(const rel of staged)if(!old.has(rel)&&!LOCAL_PRESERVE.has(rel.split('/')[0]))rmSync(resolve(ROOT,rel),{force:true,recursive:true});copyCustomerSource(snapshot,ROOT,{preserveDest:true});}
function walkRelativeFiles(root){const out=new Set();const walk=(dir,prefix='')=>{for(const e of readdirSync(dir,{withFileTypes:true})){if(['node_modules','dist','dist-server','backups','.dorm-update-staging','.dorm-update-previous-source','.dorm-update-rollback-dist'].includes(e.name))continue;const rel=prefix?`${prefix}/${e.name}`:e.name;if(e.isDirectory())walk(resolve(dir,e.name),rel);else out.add(rel)}};walk(root);return out;}
'''
s=s.replace(anchor,helpers)
# Required fs import symbols for helpers.
s=s.replace("import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';","import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs';")
# Snapshot current local source before mutations, switch after live health, rollback it on failure.
old="const oldDist=resolve(ROOT,'.dorm-update-rollback-dist');rmSync(oldDist,{recursive:true,force:true});cpSync(resolve(ROOT,'dist'),oldDist,{recursive:true});const staging=resolve(ROOT,'.dorm-update-staging',manifest.version);safeExtract(bytes,staging);"
new="const oldDist=resolve(ROOT,'.dorm-update-rollback-dist');rmSync(oldDist,{recursive:true,force:true});cpSync(resolve(ROOT,'dist'),oldDist,{recursive:true});const localSnapshot=snapshotLocalSource(fromVersion);const staging=resolve(ROOT,'.dorm-update-staging',manifest.version);safeExtract(bytes,staging);"
if old not in s: raise RuntimeError('snapshot anchor missing')
s=s.replace(old,new)
s=s.replace("let deployed=false;try{","let deployed=false,localSwitched=false;try{")
old="writeFileSync(STATE,JSON.stringify({currentVersion:manifest.version,channel:'stable',updatedAt:new Date().toISOString(),manifest},null,2));return {updated:true,fromVersion,toVersion:manifest.version,backup:appBackup.path,sqlBackup};}catch(e){if(deployed)wrangler(['pages','deploy',oldDist,'--project-name',config.projectName]);await restoreBackup(base,appBackup).catch(()=>false);throw e;}"
new="switchLocalSource(staging);localSwitched=true;writeFileSync(STATE,JSON.stringify({currentVersion:manifest.version,channel:'stable',updatedAt:new Date().toISOString(),manifest},null,2));return {updated:true,fromVersion,toVersion:manifest.version,backup:appBackup.path,sqlBackup};}catch(e){if(localSwitched)restoreLocalSource(localSnapshot,staging);if(deployed)wrangler(['pages','deploy',oldDist,'--project-name',config.projectName]);await restoreBackup(base,appBackup).catch(()=>false);throw e;}"
if old not in s: raise RuntimeError('switch/rollback anchor missing')
s=s.replace(old,new)
p.write_text(s)

# Standalone one-time V16 bootstrap: same updater logic, embeds contract so no V17 module is required beforehand.
contract=(r/'scripts/update-contract.mjs').read_text()
contract=contract.replace("import { createHash, webcrypto } from 'node:crypto';", "import { createHash, webcrypto } from 'node:crypto';")
# Remove export keywords because the helpers are local in the standalone script.
for token in ['export const ','export function ','export async function ']: contract=contract.replace(token, token.replace('export ',''))
up=s
up=up.replace("import { assertUpdatePolicy, sha256Bytes, verifyUpdateManifestSignature } from './scripts/update-contract.mjs';", contract)
up=up.replace("export async function runUpdateWorkflow", "async function runUpdateWorkflow")
up=up.replace("export async function main", "async function main")
up=up.replace("if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url)))main().catch", "main().catch")
# Bootstrap must explicitly refuse roots that are already V17+; one-time only.
needle="async function runUpdateWorkflow({ask}){if(!existsSync(CONFIG))throw new Error('wrangler.jsonc is required');const fromVersion=currentVersion();"
repl="async function runUpdateWorkflow({ask}){if(!existsSync(CONFIG))throw new Error('wrangler.jsonc is required');const fromVersion=currentVersion();if(compareSemver(fromVersion,'1.2.0')>=0)throw new Error('BOOTSTRAP_NOT_REQUIRED');"
if needle not in up: raise RuntimeError('bootstrap version guard anchor missing')
up=up.replace(needle,repl)
(r/'BOOTSTRAP-V16-TO-V17.mjs').write_text(up)
(r/'BOOTSTRAP-V16-TO-V17-WINDOWS.cmd').write_text('@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nnode BOOTSTRAP-V16-TO-V17.mjs\r\nset "EXIT_CODE=%ERRORLEVEL%"\r\npause\r\nexit /b %EXIT_CODE%\r\n')
# More safety tests.
t=r/'tests/update-updater-final.test.mjs'
t.write_text("""import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';\nconst u=readFileSync(new URL('../UPDATE-PACKAGE.mjs',import.meta.url),'utf8');const b=readFileSync(new URL('../BOOTSTRAP-V16-TO-V17.mjs',import.meta.url),'utf8');\ntest('ZIP directory entries are created as directories',()=>assert.match(u,/name\\.endsWith\\('\/'\\).*mkdirSync/));\ntest('successful update switches local source and rollback restores snapshot',()=>{assert.match(u,/snapshotLocalSource\\(fromVersion\\)/);assert.match(u,/switchLocalSource\\(staging\\)/);assert.match(u,/restoreLocalSource\\(localSnapshot,staging\\)/)});\ntest('V16 bootstrap embeds signed manifest verification and one-time guard',()=>{assert.doesNotMatch(b,/from '.\\/scripts\\/update-contract/);assert.match(b,/dorm-update-manifest-v1/);assert.match(b,/BOOTSTRAP_NOT_REQUIRED/);assert.match(b,/verifyUpdateManifestSignature/)});\n""")
pkg=r/'package.json'; x=json.loads(pkg.read_text()); x['scripts']['test:update']='node --test tests/update-contract.test.mjs tests/update-updater-safety.test.mjs tests/update-updater-final.test.mjs'; pkg.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
print('V17 updater finalization applied')
