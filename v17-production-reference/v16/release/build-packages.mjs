import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCustomerTree } from './package-audit.mjs';
import { createZipFromDirectory, verifyZipBytes } from './zip-utils.mjs';

const MASTER_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const DEFAULT_STAGING_ROOT = resolve(MASTER_ROOT, '..', `.dorm-v14-staging-${basename(MASTER_ROOT)}`);
const CUSTOMER_TEST_SCRIPT = 'npm run test:settings && npm run test:notes && npm run test:regression && npm run test:rbac && npm run test:navigation && npm run test:plans && npm run test:setup && npm run test:upgrade && npm run test:backup && npm run test:handoff';
const CUSTOMER_RELEASE_CHECK = 'npm run customer:preflight && npm run version:sync && npm test && npm run lint && npm run check:cloudflare-types';
const CUSTOMER_SETUP_TEST = 'node --test tests/setup-cloudflare.test.mjs tests/customer-preflight.test.mjs tests/windows-launchers.test.mjs tests/d1-export-windows.test.mjs tests/final-delivery.test.mjs';
const APPROVED = Object.freeze({
  demo: { maxRooms: 5, maxStaff: 0, requiresLicense: false },
  basic: { maxRooms: 10, maxStaff: 0, requiresLicense: true },
  standard: { maxRooms: 30, maxStaff: 2, requiresLicense: true },
  pro: { maxRooms: 100, maxStaff: 5, requiresLicense: true },
});
const MASTER_ONLY = new Set([
  'scripts/build-packages.mjs', 'scripts/release-packages.mjs', 'scripts/package-audit.mjs', 'scripts/zip-utils.mjs',
  'tests/license-public-config.test.mjs', 'tests/package-builder.test.mjs', 'tests/package-parity.test.mjs', 'tests/package-audit.test.mjs', 'tests/package-release.test.mjs', 'tests/master-launchers.test.mjs', 'tests/zip-utils.test.mjs',
  'BUILD-PACKAGES-WINDOWS.cmd', 'BUILD-PACKAGES-ANDROID.sh', 'MASTER_PROJECT_TH.md', 'wrangler.master.jsonc', 'RELEASE_NOTES_V13_TH.md', 'TASK12_STATUS_TH.md',
]);
const MASTER_PREFIXES = ['.git/', 'node_modules/', 'docs/superpowers/', 'package-plans/', 'release-v13/', 'preview-v13/', '.staging-v13/', 'release-v14/', 'preview-v14/', '.staging-v14/', 'dist/', 'dist-server/', 'backups/'];

export function validatePlanConfig(plan) {
  if (!plan || !Object.hasOwn(APPROVED, plan.id)) throw new Error(`Unsupported plan: ${plan?.id ?? 'missing'}`);
  if (typeof plan.label !== 'string' || !plan.label.trim()) throw new Error(`${plan.id}: label is required`);
  if (typeof plan.packageName !== 'string' || plan.packageName !== `dorm-management-system-${plan.id}`) throw new Error(`${plan.id}: invalid packageName`);
  const approved = APPROVED[plan.id];
  if (plan?.limits?.maxRooms !== approved.maxRooms) throw new Error(`${plan.id}: maxRooms must be ${approved.maxRooms}`);
  if (plan?.limits?.maxStaff !== approved.maxStaff) throw new Error(`${plan.id}: maxStaff must be ${approved.maxStaff}`);
  if (!Array.isArray(plan.features) || plan.features.length === 0 || plan.features.some((x) => typeof x !== 'string' || !x.trim())) throw new Error(`${plan.id}: features must be a non-empty string array`);
  if (typeof plan.googleOAuthExample !== 'boolean') throw new Error(`${plan.id}: googleOAuthExample must be boolean`);
  if (plan.requiresLicense !== approved.requiresLicense) throw new Error(`${plan.id}: requiresLicense must be ${approved.requiresLicense}`);
  return plan;
}

export async function loadPlans(directoryUrl = new URL('../package-plans/', import.meta.url)) {
  const out = {};
  for (const id of Object.keys(APPROVED)) {
    const plan = validatePlanConfig(JSON.parse(await readFile(new URL(`${id}.json`, directoryUrl), 'utf8')));
    if (plan.id !== id) throw new Error(`${id}.json declares mismatched id ${plan.id}`);
    out[id] = plan;
  }
  return out;
}

export function replaceExactCount(text, search, replacement, expected, label) {
  if (!search) throw new Error(`${label}: empty search anchor`);
  const count = text.split(search).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} occurrence(s), found ${count}`);
  return text.split(search).join(replacement);
}

async function mutateText(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  await writeFile(path, after, 'utf8');
}

function readmeFor(plan, appVersion, customerReady = true) {
  const deliveryLabel = customerReady ? 'Customer Delivery V14' : 'PREVIEW V14 — NOT FOR PRODUCTION';
  return `# Dorm Management System — ${plan.label}\n\n**${deliveryLabel}** | App version \`${appVersion}\`\n\nแพ็กเกจนี้สร้างอัตโนมัติจาก **V14 Master Package Builder** และพร้อมสำหรับติดตั้งบน Cloudflare Pages + D1 โดยมี Setup / Deploy / Upgrade Manager สำหรับ Windows และ Android/Termux\n\n## แพ็กเกจนี้\n\n- แพ็กเกจ: **${plan.label}**\n- ห้องสูงสุด: **${plan.limits.maxRooms} ห้อง**\n- ผู้ดูแลร่วมสูงสุด: **${plan.limits.maxStaff} คน**\n- \`subscription_plan\`: \`${plan.id}\`\n\n## ฟีเจอร์หลัก\n\n${plan.features.map((x) => `- ${x}`).join('\n')}\n\n## เริ่มใช้งานบน Windows\n\n1. ติดตั้ง Node.js 22 ขึ้นไป\n2. แตก ZIP ลงโฟลเดอร์ใหม่\n3. ดับเบิลคลิก \`SETUP-WINDOWS.cmd\`\n4. เลือกบัญชี Cloudflare และกรอกชื่อ Pages Project / D1 Database\n5. ให้ Setup ตรวจ Local + Release checks\n6. เมื่อพร้อม Production พิมพ์ \`DEPLOY\` ตามที่ระบบถาม\n\nDeploy ครั้งต่อไปใช้ \`DEPLOY-WINDOWS.cmd\`\n\n## Upgrade\n\nใช้ \`UPGRADE-WINDOWS.cmd\` เมื่อต้องการอัปเกรดเป็นแพ็กเกจที่สูงกว่า โดยใช้ Pages Project และ D1 Database เดิม ระบบจะ Backup ก่อนเปลี่ยนแพ็กเกจ ไม่มี Downgrade อัตโนมัติใน V14\n\n## บิลบนมือถือ\n\nหน้าพรีวิวบิลบนมือถือคง layout แบบเดียวกับคอมและย่อทั้งใบให้พอดีจอ ส่วน JPG / Print / PDF ใช้ขนาดต้นฉบับเต็ม\n\n## เอกสาร\n\n- \`SETUP_GUIDE_TH.md\` — ติดตั้งครั้งแรก\n- \`CUSTOMER_DEPLOY_GUIDE_TH.md\` — Deploy / Cloudflare / D1\n- \`UPGRADE_GUIDE_TH.md\` — อัปเกรดแพ็กเกจ\n- \`CUSTOMER_CHECKLIST_TH.md\` — เช็กลิสต์ก่อนส่ง Production\n- \`PACKAGE_VARIANT.md\` — ขอบเขตแพ็กเกจ\n- \`RELEASE_NOTES_V14_TH.md\` — สิ่งที่แก้ในชุดส่งมอบนี้\n\n> ห้ามใส่ Secret จริงลง \`.env\`, \`.dev.vars.example\`, source code หรือ Git repository\n`;
}

function packageVariantFor(plan, customerReady = true) {
  const deliveryLabel = customerReady ? 'Customer Delivery V14' : 'PREVIEW V14 — NOT FOR PRODUCTION';
  return `# PACKAGE VARIANT — ${plan.label}\n\n**${deliveryLabel}**\n\n- แพ็กเกจ: **${plan.label}**\n- จำนวนห้องสูงสุด: **${plan.limits.maxRooms} ห้อง**\n- ผู้ดูแลร่วมสูงสุด: **${plan.limits.maxStaff} คน**\n- \`subscription_plan\`: \`${plan.id}\`\n\n## ฟีเจอร์\n\n${plan.features.map((x) => `- ${x}`).join('\n')}\n\nPlan Entitlements ถูกบังคับทั้ง UI และ API การอัปเกรดใช้ Upgrade Manager V14 กับ Pages Project และ D1 เดิม พร้อม Backup ก่อนเปลี่ยนแพ็กเกจ\n`;
}

function deliveryStatusFor(plan, appVersion, customerReady = true) {
  const deliveryLabel = customerReady ? 'Customer Delivery V14' : 'PREVIEW V14 — NOT FOR PRODUCTION';
  return `# สถานะชุดส่งมอบ — ${plan.label} / ${deliveryLabel}\n\n- App version: \`${appVersion}\`\n- แพ็กเกจ: \`${plan.id}\`\n- ห้องสูงสุด: ${plan.limits.maxRooms}\n- ผู้ดูแลร่วมสูงสุด: ${plan.limits.maxStaff}\n- Setup/Deploy/Upgrade: Cloudflare Pages + D1\n- Windows และ Android/Termux launcher รวมอยู่ใน ZIP\n- สร้างจาก V14 Master Package Builder\n\n## Release gate ก่อน Production\n\nบนเครื่องที่มี Internet ให้รัน:\n\n\`\`\`bash\nnpm ci\nnpm run release:check\nnpm run build:pages\n\`\`\`\n\nหากคำสั่งใด fail ให้หยุดก่อน Deploy และแก้ error ก่อนเสมอ\n\n## V14 release engineering\n\n- Demo / Basic / Standard / Pro ถูกสร้างจาก source เดียวกัน\n- Builder ตรวจ plan identity, package-lock, secret files, customer-only contents และ portable tests ก่อนสร้าง ZIP\n- ไม่มี active \`wrangler.jsonc\` ใน ZIP; Setup สร้างจาก template หลังระบุ resource ของลูกค้า\n- Upgrade ใช้ Pages/D1 เดิมและสำรองฐานก่อนเปลี่ยนแพ็กเกจ\n- บิลบนมือถือคง layout แบบคอม\n- URL หลัง Deploy อ่านจาก Cloudflare Project Domains จริง\n`;
}

function devVarsFor(plan) {
  let text = '# Local Pages Functions secrets only.\n# Copy this file to .dev.vars and never commit the real values.\n\nJWT_SECRET="replace-with-at-least-32-random-characters"\n';
  if (plan.googleOAuthExample) text += 'GOOGLE_CLIENT_ID="your-google-oauth-client-id"\nGOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"\n';
  return text;
}

function shouldCopy(source, extraExcludedRoots = []) {
  const full = resolve(source);
  for (const excluded of extraExcludedRoots) {
    const target = resolve(excluded);
    if (full === target || full.startsWith(target + sep)) return false;
  }
  const rel = relative(MASTER_ROOT, source).replaceAll('\\', '/');
  if (!rel) return true;
  if (MASTER_ONLY.has(rel)) return false;
  if (MASTER_PREFIXES.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix))) return false;
  if (rel === 'wrangler.jsonc' || rel === '.env' || rel === '.dev.vars') return false;
  return true;
}

function resolvePublicLicenseConfig(options = {}) {
  const publicKeyBase64 = String(options.publicKeyBase64 ?? process.env.V16_LICENSE_SIGNING_PUBLIC_KEY ?? '').trim();
  const controlPlaneUrl = String(options.controlPlaneUrl ?? process.env.V16_LICENSE_CONTROL_PLANE_URL ?? '').trim().replace(/\/+$/, '');
  return { publicKeyBase64, controlPlaneUrl };
}

async function setPlanDefaults(root, planId, publicLicenseConfig = { publicKeyBase64: '', controlPlaneUrl: '' }) {
  await mutateText(join(root, 'd1-migrations/0005_add_subscription_plan.sql'), (t) => replaceExactCount(t, "DEFAULT 'pro'", `DEFAULT '${planId}'`, 1, 'migration default'));
  await mutateText(join(root, 'schema_d1.sql'), (t) => replaceExactCount(t, "DEFAULT 'pro'", `DEFAULT '${planId}'`, 1, 'schema_d1 default'));
  await mutateText(join(root, 'src/db/schema.ts'), (t) => replaceExactCount(t, ".default('pro').notNull()", `.default('${planId}').notNull()`, 1, 'drizzle plan default'));
  await mutateText(join(root, 'functions/api/[[path]].ts'), (t0) => {
    let t = replaceExactCount(t0, "subscription_plan TEXT NOT NULL DEFAULT 'pro'", `subscription_plan TEXT NOT NULL DEFAULT '${planId}'`, 1, 'pages schema default');
    return t;
  });
  await mutateText(join(root, 'src/generated/licenseConfig.ts'), (t0) => {
    let t = replaceExactCount(t0, "packagePlan: 'pro'", `packagePlan: '${planId}'`, 1, 'license package plan');
    t = replaceExactCount(t, 'requiresLicense: true', `requiresLicense: ${planId === 'demo' ? 'false' : 'true'}`, 1, 'license requirement');
    t = replaceExactCount(t, "publicKeyBase64: '',", `publicKeyBase64: ${JSON.stringify(publicLicenseConfig.publicKeyBase64)},`, 1, 'license public key');
    t = replaceExactCount(t, "controlPlaneUrl: '',", `controlPlaneUrl: ${JSON.stringify(publicLicenseConfig.controlPlaneUrl)},`, 1, 'license control plane url');
    return t;
  });
  await mutateText(join(root, 'src/constants/planEntitlements.ts'), (t) => replaceExactCount(t, "    : 'pro';", `    : '${planId}';`, 1, 'frontend fallback plan'));
  await mutateText(join(root, 'tests/plan-entitlements.test.ts'), (t0) => {
    let t = replaceExactCount(t0, 'falls back to pro', `falls back to ${planId}`, 1, 'plan test title');
    t = replaceExactCount(t, "assert.equal(normalizeSubscriptionPlan(null), 'pro');", `assert.equal(normalizeSubscriptionPlan(null), '${planId}');`, 1, 'plan null fallback test');
    t = replaceExactCount(t, "assert.equal(normalizeSubscriptionPlan('enterprise'), 'pro');", `assert.equal(normalizeSubscriptionPlan('enterprise'), '${planId}');`, 1, 'plan invalid fallback test');
    return t;
  });
}

export async function buildPackageTree(planInput, options = {}) {
  const plan = validatePlanConfig(planInput);
  const destination = resolve(options.destination ?? join(DEFAULT_STAGING_ROOT, plan.id));
  const insideMaster = destination.startsWith(MASTER_ROOT + sep);
  const parentOfMaster = MASTER_ROOT.startsWith(destination + sep);
  if (destination === MASTER_ROOT || insideMaster || parentOfMaster) throw new Error('Refusing unsafe staging destination');
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  const extraExcludedRoots = Array.isArray(options.extraExcludedRoots) ? options.extraExcludedRoots : [];
  await cp(MASTER_ROOT, destination, { recursive: true, filter: (source) => shouldCopy(source, extraExcludedRoots) });

  const pkgPath = join(destination, 'package.json');
  const lockPath = join(destination, 'package-lock.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const appVersion = pkg.version;
  pkg.name = plan.packageName;
  pkg.scripts.test = CUSTOMER_TEST_SCRIPT.replace('npm run test:plans &&', 'npm run test:plans && npm run test:license &&');
  pkg.scripts['test:license'] = 'node --test tests/license-settings-ui.test.mjs tests/license-lifecycle-readonly.test.mjs';
  pkg.scripts['test:setup'] = CUSTOMER_SETUP_TEST;
  pkg.scripts['release:check'] = CUSTOMER_RELEASE_CHECK;
  for (const script of ['packages:generate', 'packages:release', 'test:builder', 'test:setup:master', 'check:cloudflare-types:master']) delete pkg.scripts?.[script];
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  lock.name = plan.packageName;
  if (lock.packages?.['']) lock.packages[''].name = plan.packageName;
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');

  const publicLicenseConfig = resolvePublicLicenseConfig(options.publicLicenseConfig);
  if (options.customerReady === true && plan.requiresLicense && (!publicLicenseConfig.publicKeyBase64 || !publicLicenseConfig.controlPlaneUrl)) {
    throw new Error('Paid CUSTOMER-READY packages require V16_LICENSE_SIGNING_PUBLIC_KEY and V16_LICENSE_CONTROL_PLANE_URL');
  }
  await setPlanDefaults(destination, plan.id, publicLicenseConfig);
  await writeFile(join(destination, '.dev.vars.example'), devVarsFor(plan));
  const customerReady = options.customerReady !== false;
  await writeFile(join(destination, 'README.md'), readmeFor(plan, appVersion, customerReady));
  await writeFile(join(destination, 'PACKAGE_VARIANT.md'), packageVariantFor(plan, customerReady));
  await writeFile(join(destination, 'DELIVERY_STATUS_TH.md'), deliveryStatusFor(plan, appVersion, customerReady));
  if (!customerReady) await writeFile(join(destination, 'PREVIEW_ONLY.txt'), 'PREVIEW V14 — NOT FOR PRODUCTION\nUse BUILD-PACKAGES-WINDOWS.cmd / npm run packages:release for customer-ready packages.\n');

  if (options.runPortableTests !== false) {
    const tests = (await readdir(join(destination, 'tests'))).filter((x) => x.endsWith('.mjs')).map((x) => join('tests', x));
    const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: destination, stdio: 'pipe', encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${plan.id}: portable tests failed\n${result.stdout}\n${result.stderr}`);
  }
  const issues = await auditCustomerTree(destination, { ...plan, requirePublicLicenseConfig: options.customerReady === true });
  if (issues.length) throw new Error(`${plan.id}: customer audit failed\n- ${issues.join('\n- ')}`);
  return destination;
}

export async function buildAllPackages(options = {}) {
  const plans = await loadPlans();
  const roots = {};
  for (const plan of Object.values(plans)) {
    const planOptions = typeof options.forPlan === 'function' ? options.forPlan(plan) : options;
    roots[plan.id] = await buildPackageTree(plan, planOptions);
  }
  return roots;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function qaReportFor(results, customerReady) {
  const lines = [
    '# V14 Master Package Builder — QA Report',
    '',
    `โหมด: ${customerReady ? 'CUSTOMER-READY (full release gate ต้องผ่านก่อนเรียกโหมดนี้)' : 'PREVIEW (ห้ามส่งลูกค้าเป็น Production)'}`,
    '',
    'ชุดนี้สร้าง Demo / Basic / Standard / Pro จาก Master source เดียว',
    '',
    '| Package | Rooms | Staff | Portable tests | Customer audit | ZIP verify | SHA256 |',
    '|---|---:|---:|---|---|---|---|',
  ];
  for (const item of Object.values(results)) {
    lines.push(`| ${item.plan.label} | ${item.plan.limits.maxRooms} | ${item.plan.limits.maxStaff} | PASS | PASS | PASS | \`${item.sha256.slice(0, 16)}…\` |`);
  }
  lines.push('', '## Safeguards', '',
    '- Exact mutation anchors: missing/duplicate anchors stop generation.',
    '- Customer ZIPs exclude Master builder internals, active Cloudflare config, secrets, node_modules, .git, build output and backups.',
    '- Each staged package runs portable Node tests and customer audit before ZIP creation.',
    '- Each final ZIP is reopened and CRC-verified before checksum publication.',
    '- Full `packages:release` additionally runs the Master release gate and production build before generation.',
    '',
    '## Production rule', '',
    'Customer deployment must still pass `npm ci`, `npm run release:check`, and `npm run build:pages` on the deployment machine before Production.',
    ''
  );
  return lines.join('\n');
}

export async function generateRelease(options = {}) {
  const customerReady = options.customerReady === true;
  const releaseDir = resolve(options.releaseDir ?? join(MASTER_ROOT, customerReady ? 'release-v14' : 'preview-v14'));
  const stagingRoot = resolve(options.stagingRoot ?? DEFAULT_STAGING_ROOT);
  if (releaseDir === MASTER_ROOT || stagingRoot === MASTER_ROOT) throw new Error('Unsafe release/staging root');
  await rm(releaseDir, { recursive: true, force: true });
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(releaseDir, { recursive: true });
  await mkdir(stagingRoot, { recursive: true });

  const plans = await loadPlans();
  const packages = {};
  const checksumLines = [];
  for (const plan of Object.values(plans)) {
    const root = await buildPackageTree(plan, {
      destination: join(stagingRoot, plan.id),
      runPortableTests: options.runPortableTests !== false,
      customerReady,
      publicLicenseConfig: options.publicLicenseConfig,
      extraExcludedRoots: [releaseDir, stagingRoot],
    });
    const zipBytes = await createZipFromDirectory(root);
    const verified = verifyZipBytes(zipBytes);
    const filename = `dorm-management-system-${plan.id}-v14-${customerReady ? 'CUSTOMER-READY' : 'PREVIEW'}.zip`;
    if (!verified.names.includes('package.json') || !verified.names.includes('SETUP-WINDOWS.cmd') || !verified.names.includes('UPGRADE-WINDOWS.cmd')) {
      throw new Error(`${plan.id}: final ZIP missing required delivery files`);
    }
    if (verified.names.includes('wrangler.jsonc') || verified.names.some((x) => x.startsWith('package-plans/') || x.startsWith('docs/superpowers/'))) {
      throw new Error(`${plan.id}: final ZIP contains forbidden Master/config files`);
    }
    const zippedPkg = JSON.parse(verified.entries.get('package.json').toString('utf8'));
    if (zippedPkg.name !== plan.packageName) throw new Error(`${plan.id}: final ZIP package identity mismatch`);
    const digest = sha256(zipBytes);
    await writeFile(join(releaseDir, filename), zipBytes);
    checksumLines.push(`${digest}  ${filename}`);
    packages[plan.id] = { plan, filename, sha256: digest, size: zipBytes.length };
  }
  await writeFile(join(releaseDir, 'SHA256SUMS.txt'), checksumLines.join('\n') + '\n');
  await writeFile(join(releaseDir, 'QA_REPORT_TH.md'), qaReportFor(packages, customerReady));
  if (options.keepStaging !== true) await rm(stagingRoot, { recursive: true, force: true });
  return { releaseDir, packages };
}

async function main() {
  const customerReady = process.argv.includes('--customer-ready');
  const preview = process.argv.includes('--preview');
  if (customerReady && preview) throw new Error('Choose either --customer-ready or --preview, not both');
  if (customerReady) throw new Error('Direct --customer-ready generation is disabled; use npm run packages:release so the full release gate runs first.');
  const result = await generateRelease({ runPortableTests: true, customerReady: false });
  for (const item of Object.values(result.packages)) {
    console.log(`✓ ${item.plan.label}: ${item.filename} (${(item.size / 1024 / 1024).toFixed(2)} MB)`);
  }
  console.log(`✓ Mode: ${customerReady ? 'CUSTOMER-READY' : 'PREVIEW'}`);
  console.log(`✓ QA report: ${join(result.releaseDir, 'QA_REPORT_TH.md')}`);
  console.log(`✓ SHA256: ${join(result.releaseDir, 'SHA256SUMS.txt')}`);
}

const invokedAsMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsMain) await main();
