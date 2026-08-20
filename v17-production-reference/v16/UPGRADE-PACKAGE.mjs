import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import readline from 'node:readline/promises';
import {
  upgradeTargets,
  validateUpgrade,
  extractSubscriptionPlans,
  buildPlanUpdateSql,
  readDeploymentConfig,
  commandUsesShell,
  wranglerInvocation,
} from './scripts/plan-upgrade.mjs';
import {
  chooseCloudflareAccount,
  configureExistingResourcesForUpgrade,
  projectUrlsFromList,
} from './SETUP-CLOUDFLARE.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = dirname(SCRIPT_PATH);
const WRANGLER_CONFIG = resolve(ROOT, 'wrangler.jsonc');

const CURRENT_PLAN_SQL = [
  `SELECT s.subscription_plan`,
  `FROM settings s`,
  `JOIN users u ON u.id = s.user_id`,
  `WHERE u.role IN ('owner', 'super_admin')`,
  `  AND u.deleted_at IS NULL`,
  `ORDER BY s.id ASC;`,
].join('\n');

function parseJsonOutput(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('Wrangler returned empty JSON output');
  const candidates = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '[' || raw[i] === '{') candidates.push(i);
  }
  for (const start of candidates) {
    try {
      return JSON.parse(raw.slice(start));
    } catch {
      // Wrangler may print a banner before JSON; try the next JSON-looking offset.
    }
  }
  throw new Error(`Cannot parse Wrangler JSON output: ${raw.slice(0, 240)}`);
}

function command(bin, args, { capture = false } = {}) {
  const result = spawnSync(bin, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: commandUsesShell(bin),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`${bin} ${args.join(' ')} failed${details ? `\n${details}` : ''}`);
  }
  return capture ? String(result.stdout ?? '') : '';
}

function runNpmDefault(args, options) {
  return command(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options);
}

function runWranglerDefault(args, options) {
  const invocation = wranglerInvocation({
    root: ROOT,
    nodeExecutable: process.execPath,
    platform: process.platform,
    exists: existsSync,
  });
  return command(invocation.bin, [...invocation.prefix, ...args], options);
}

function runNodeDefault(args, options) {
  return command(process.execPath, args, options);
}

function ensureNode22() {
  const major = Number(process.versions.node.split('.')[0] || 0);
  if (major < 22) throw new Error(`Node.js 22+ required. Found ${process.version}`);
}

function ensureDependencies(runNpm = runNpmDefault) {
  const wranglerBin = resolve(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  if (existsSync(wranglerBin)) return;
  console.log('\nติดตั้ง dependencies ด้วย npm ci ...');
  runNpm(['ci']);
}

function readCurrentPlan(runWrangler) {
  const outputText = runWrangler(
    ['d1', 'execute', 'DB', '--remote', '--json', '--command', CURRENT_PLAN_SQL],
    { capture: true },
  );
  const plans = extractSubscriptionPlans(parseJsonOutput(outputText));
  if (plans.length === 0) throw new Error('ไม่พบ subscription_plan ของเจ้าของระบบใน D1');
  if (plans.length > 1) throw new Error(`พบ subscription_plan มากกว่า 1 ค่าใน D1: ${plans.join(', ')}`);
  return plans[0];
}

function updateRemotePlan(runWrangler, targetPlan) {
  const sql = buildPlanUpdateSql(targetPlan);
  runWrangler(['d1', 'execute', 'DB', '--remote', '--json', '--command', sql], { capture: true });
}

function defaultBackupPathFactory(fromPlan, toPlan) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `./backups/upgrade-${stamp}-${fromPlan}-to-${toPlan}.sql`;
}

async function chooseTarget(ask, currentPlan) {
  const targets = upgradeTargets(currentPlan);
  if (targets.length === 0) throw new Error(`แพ็กเกจ ${currentPlan} เป็นแพ็กเกจสูงสุดแล้ว ไม่มีแพ็กเกจให้อัปเกรด`);
  while (true) {
    console.log(`\nแพ็กเกจปัจจุบัน: ${currentPlan}`);
    targets.forEach((plan, index) => console.log(`[${index + 1}] Upgrade เป็น ${plan}`));
    console.log('[0] ยกเลิก');
    const answer = String(await ask('เลือกแพ็กเกจปลายทาง: ')).trim();
    if (answer === '0') throw new Error('Upgrade cancelled by user');
    const selected = targets[Number(answer) - 1];
    if (selected) return selected;
    console.log('✗ กรุณาเลือกหมายเลขจากรายการ');
  }
}

export async function runUpgradeWorkflow({
  configSource,
  targetPlan,
  ask,
  runNpm = runNpmDefault,
  runNode = runNodeDefault,
  runWrangler = runWranglerDefault,
  log = console.log,
  backupPathFactory = defaultBackupPathFactory,
}) {
  if (typeof ask !== 'function') throw new Error('ask function is required');
  const { projectName, databaseName } = readDeploymentConfig(configSource);

  runWrangler(['whoami'], { capture: true });
  log(`\nProject เดิม: ${projectName}`);
  log(`D1 เดิม:      ${databaseName}`);
  const installationConfirm = String(await ask('ยืนยันว่าเป็นระบบลูกค้าที่ต้องการอัปเกรดหรือไม่? [Y/n]: ')).trim().toLowerCase();
  if (installationConfirm && !['y', 'yes'].includes(installationConfirm)) {
    throw new Error('Upgrade cancelled before customer validation');
  }

  runNpm(['run', 'customer:preflight']);

  const initialPlan = readCurrentPlan(runWrangler);
  const selectedTarget = targetPlan
    ? validateUpgrade(initialPlan, targetPlan)
    : await chooseTarget(ask, initialPlan);

  const backupPath = backupPathFactory(initialPlan, selectedTarget);
  log(`\nสำรอง D1 ก่อนอัปเกรด → ${backupPath}`);
  runNode(['scripts/d1-export.mjs', '--remote', backupPath]);

  log('\nตรวจ release ก่อนแก้ Production ...');
  runNpm(['run', 'release:check']);

  log('\nรัน D1 migrations ที่ยังค้าง ...');
  runNpm(['run', 'd1:migrate:remote']);

  const currentPlan = readCurrentPlan(runWrangler);
  const finalTarget = validateUpgrade(currentPlan, selectedTarget);

  log('\nสรุปการอัปเกรด');
  log(`Pages Project: ${projectName}`);
  log(`D1 Database:   ${databaseName}`);
  log(`Package:       ${currentPlan} → ${finalTarget}`);
  log(`Backup:        ${backupPath}`);
  const exactConfirm = String(await ask('พิมพ์ UPGRADE เพื่อยืนยันการเปลี่ยนแพ็กเกจ: ')).trim();
  if (exactConfirm !== 'UPGRADE') throw new Error('Upgrade cancelled before plan mutation');

  updateRemotePlan(runWrangler, finalTarget);
  const verifiedPlan = readCurrentPlan(runWrangler);
  if (verifiedPlan !== finalTarget) {
    throw new Error(`ตรวจสอบแพ็กเกจหลังอัปเกรดไม่ผ่าน: expected ${finalTarget}, got ${verifiedPlan}`);
  }

  log('\nBuild และ Deploy ทับ Pages Project เดิม ...');
  runNpm(['run', 'build:pages']);
  runWrangler(['pages', 'deploy', 'dist', '--project-name', projectName]);

  let projectUrls = [];
  try {
    const projects = parseJsonOutput(runWrangler(['pages', 'project', 'list', '--json'], { capture: true }));
    projectUrls = projectUrlsFromList(projects, projectName);
  } catch {
    projectUrls = [];
  }

  log(`\nUpgrade สำเร็จ: ${currentPlan} → ${finalTarget}`);
  if (projectUrls.length > 0) {
    log('URL จริงจาก Cloudflare:');
    projectUrls.forEach((url) => log(`- ${url}`));
  } else {
    log('ไม่สามารถอ่าน URL จาก Cloudflare ได้อัตโนมัติ — ตรวจที่ Workers & Pages > Project > Deployments');
  }
  return {
    projectName,
    databaseName,
    fromPlan: currentPlan,
    toPlan: finalTarget,
    backupPath,
    projectUrls,
  };
}

export async function resolveUpgradeConfig({ hasConfig, readConfig, configureExisting }) {
  if (!hasConfig()) {
    await configureExisting();
  }
  if (!hasConfig()) {
    throw new Error('ไม่สามารถสร้าง wrangler.jsonc สำหรับระบบเดิมได้');
  }
  return readConfig();
}

export async function main(argv = process.argv.slice(2)) {
  ensureNode22();
  ensureDependencies();
  const targetIndex = argv.indexOf('--to');
  const targetPlan = targetIndex >= 0 ? argv[targetIndex + 1] : undefined;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await chooseCloudflareAccount(rl, runWranglerDefault);

    const configSource = await resolveUpgradeConfig({
      hasConfig: () => existsSync(WRANGLER_CONFIG),
      readConfig: () => readFileSync(WRANGLER_CONFIG, 'utf8'),
      configureExisting: async () => {
        if (!existsSync(resolve(ROOT, 'wrangler.template.jsonc'))) {
          throw new Error('ไม่พบ wrangler.template.jsonc — กรุณาแตกไฟล์ชุดส่งมอบใหม่อีกครั้ง');
        }
        console.log('\nไม่พบ wrangler.jsonc ในโฟลเดอร์นี้ — กำลังเชื่อม Pages Project และ D1 เดิมสำหรับ Upgrade');
        await configureExistingResourcesForUpgrade(rl, { run: runWranglerDefault });
      },
    });

    if (argv.includes('--show')) {
      runNpmDefault(['run', 'customer:preflight']);
      const { projectName, databaseName } = readDeploymentConfig(configSource);
      const currentPlan = readCurrentPlan(runWranglerDefault);
      console.log(`Pages Project: ${projectName}`);
      console.log(`D1 Database:   ${databaseName}`);
      console.log(`Package:       ${currentPlan}`);
      return;
    }

    await runUpgradeWorkflow({
      configSource,
      targetPlan,
      ask: (question) => rl.question(question),
    });
  } finally {
    rl.close();
  }
}

const invokedAsMain = process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH);
if (invokedAsMain) {
  main().catch((error) => {
    console.error(`\nUPGRADE FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
