import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRelease } from './build-packages.mjs';

const MASTER_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

function ensureNodeVersion() {
  const major = Number(process.versions.node.split('.')[0] || 0);
  if (major < 22) throw new Error(`Node.js 22+ required. Found ${process.version}`);
}

function runNpmScript(script) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWindows ? ['/d', '/s', '/c', `npm run ${script}`] : ['run', script];
  const result = spawnSync(command, args, { cwd: MASTER_ROOT, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm run ${script} failed with exit code ${result.status ?? 'unknown'}`);
}

async function main() {
  ensureNodeVersion();
  console.log('V14 release gate: tests / TypeScript / Cloudflare types ...');
  runNpmScript('release:check');
  console.log('V14 production build ...');
  runNpmScript('build:pages');
  console.log('V14 customer package generation ...');
  const result = await generateRelease({ customerReady: true, runPortableTests: true });
  for (const item of Object.values(result.packages)) {
    console.log(`✓ ${item.plan.label}: ${item.filename} (${(item.size / 1024 / 1024).toFixed(2)} MB)`);
  }
  console.log(`✓ CUSTOMER-READY output: ${result.releaseDir}`);
}

await main();
