import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const read = (root, file) => readFile(join(root, file), 'utf8');

test('builder stages every plan with matching identity, defaults, docs, and OAuth example scope', async () => {
  const { buildPackageTree, loadPlans } = await import('../scripts/build-packages.mjs');
  const plans = await loadPlans();
  const temp = await mkdtemp(join(tmpdir(), 'dorm-v14-parity-'));
  try {
    for (const [id, plan] of Object.entries(plans)) {
      const root = join(temp, id);
      await buildPackageTree(plan, { destination: root, runPortableTests: false });
      const pkg = JSON.parse(await read(root, 'package.json'));
      const lock = JSON.parse(await read(root, 'package-lock.json'));
      assert.equal(pkg.name, plan.packageName);
      assert.equal(lock.name, plan.packageName);
      assert.equal(lock.packages[''].name, plan.packageName);
      assert.equal(pkg.scripts['packages:generate'], undefined);
      assert.equal(pkg.scripts['packages:release'], undefined);
      assert.equal(pkg.scripts['test:builder'], undefined);
      assert.equal(pkg.scripts['check:cloudflare-types:master'], undefined);
      assert.equal(pkg.scripts['test:setup:master'], undefined);

      assert.ok((await read(root, 'd1-migrations/0005_add_subscription_plan.sql')).includes(`DEFAULT '${id}'`));
      assert.ok((await read(root, 'schema_d1.sql')).includes(`DEFAULT '${id}'`));
      assert.ok((await read(root, 'src/db/schema.ts')).includes(`.default('${id}').notNull()`));
      assert.ok((await read(root, 'src/constants/planEntitlements.ts')).includes(`    : '${id}';`));
      const pagesApi = await read(root, 'functions/api/[[path]].ts');
      assert.ok(pagesApi.includes(`subscription_plan TEXT NOT NULL DEFAULT '${id}'`));
      assert.doesNotMatch(pagesApi, /subscriptionPlan: '[a-z]+' as const/);
      assert.ok(pagesApi.includes('subscriptionPlan: fallbackSubscriptionPlan'));
      const licenseConfig = await read(root, 'src/generated/licenseConfig.ts');
      assert.ok(licenseConfig.includes(`packagePlan: '${id}'`));
      assert.ok(licenseConfig.includes(`requiresLicense: ${id === 'demo' ? 'false' : 'true'}`));
      const planTest = await read(root, 'tests/plan-entitlements.test.ts');
      assert.ok(planTest.includes(`assert.equal(normalizeSubscriptionPlan(null), '${id}');`));
      assert.ok(planTest.includes(`assert.equal(normalizeSubscriptionPlan('enterprise'), '${id}');`));
      assert.match(await read(root, 'README.md'), new RegExp(`Customer Delivery V14`));
      assert.match(await read(root, 'PACKAGE_VARIANT.md'), new RegExp(`แพ็กเกจ: \\*\\*${plan.label}\\*\\*`));
      assert.ok((await read(root, 'DELIVERY_STATUS_TH.md')).includes('แพ็กเกจ: `' + id + '`'));
      const devVars = await read(root, '.dev.vars.example');
      assert.equal(/GOOGLE_CLIENT_ID/.test(devVars), plan.googleOAuthExample);
      assert.equal(/GOOGLE_CLIENT_SECRET/.test(devVars), plan.googleOAuthExample);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('exact replacement helper fails closed when an expected anchor is missing or duplicated', async () => {
  const { replaceExactCount } = await import('../scripts/build-packages.mjs');
  assert.throws(() => replaceExactCount('abc', 'z', 'x', 1, 'demo-anchor'), /expected 1 occurrence/i);
  assert.throws(() => replaceExactCount('aaa', 'a', 'x', 1, 'demo-anchor'), /expected 1 occurrence/i);
  assert.equal(replaceExactCount('abc', 'b', 'X', 1, 'demo-anchor'), 'aXc');
});

async function listFiles(root, current = root, out = []) {
  const { readdir } = await import('node:fs/promises');
  const { relative, resolve } = await import('node:path');
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const full = resolve(current, entry.name);
    if (entry.isDirectory()) await listFiles(root, full, out);
    else out.push(relative(root, full).replaceAll('\\', '/'));
  }
  return out.sort();
}

test('all four package trees share identical implementation outside approved materialized files', async () => {
  const { buildAllPackages } = await import('../scripts/build-packages.mjs');
  const { createHash } = await import('node:crypto');
  const temp = await mkdtemp(join(tmpdir(), 'dorm-v14-code-parity-'));
  const allowed = new Set([
    '.dev.vars.example', 'README.md', 'PACKAGE_VARIANT.md', 'DELIVERY_STATUS_TH.md', 'package.json', 'package-lock.json',
    'd1-migrations/0005_add_subscription_plan.sql', 'schema_d1.sql', 'src/db/schema.ts', 'src/constants/planEntitlements.ts',
    'functions/api/[[path]].ts', 'tests/plan-entitlements.test.ts', 'src/generated/licenseConfig.ts',
  ]);
  try {
    const roots = await buildAllPackages({ forPlan: (plan) => ({ destination: join(temp, plan.id), runPortableTests: false, customerReady: false }) });
    const ids = ['demo','basic','standard','pro'];
    const baselineFiles = await listFiles(roots.demo);
    for (const id of ids) assert.deepEqual(await listFiles(roots[id]), baselineFiles, `${id} file set drift`);
    const implementationFiles = [
      'src/utils/backupFormat.ts','src/utils/backupArchive.ts','src/utils/backupRestoreUi.ts',
      'src/server/validators/backup.ts','src/server/services/backup.service.ts','src/server/services/restore.service.ts',
      'src/server/validators/logo.ts','src/server/services/branding.service.ts',
      'src/components/BackupRestoreSettings.tsx','tests/backup-archive.test.ts','tests/backup-validation.test.ts','tests/backup-restore.test.ts','tests/backup-restore-api.test.ts',
    ];
    for (const file of implementationFiles) assert.ok(baselineFiles.includes(file), `missing shared implementation file: ${file}`);

    const migrationFiles = baselineFiles.filter((file) => file.startsWith('d1-migrations/')).sort();
    assert.equal(migrationFiles.at(-1), 'd1-migrations/0007_add_license_state.sql', 'V16 Task 6 must add exactly the license-state migration after V15 0006');
    assert.equal(migrationFiles.some((file) => file.includes('brand_logo_data_uri')), false, 'Task 2 must not add a second logo migration');

    for (const id of ids) {
      const pagesApi = await read(roots[id], 'functions/api/[[path]].ts');
      assert.ok(pagesApi.includes('/api/public/branding'), `${id} public branding route missing`);
      assert.ok(pagesApi.includes('/api/settings/logo'), `${id} logo mutation route missing`);
      assert.ok((await read(roots[id], 'src/server/validators/logo.ts')).includes('LOGO_MAX_DECODED_BYTES = 307_200'), `${id} logo validator missing size contract`);
      assert.ok((await read(roots[id], 'src/server/services/branding.service.ts')).includes('buildPublicBranding'), `${id} branding projection missing`);
      for (const file of baselineFiles.filter((file) => !file.startsWith('tests/') && (file.endsWith('.ts') || file.endsWith('.mjs') || file.endsWith('.sql')))) {
        const content = await read(roots[id], file);
        assert.equal(content.includes('brand_logo_data_uri'), false, `${id} contains forbidden second logo storage field in ${file}`);
      }
    }
    for (const file of baselineFiles) {
      if (allowed.has(file)) continue;
      const digests = [];
      for (const id of ids) digests.push(createHash('sha256').update(await readFile(join(roots[id], file))).digest('hex'));
      assert.equal(new Set(digests).size, 1, `unapproved package drift: ${file}`);
    }
    const entitlementSource = await read(roots.demo, 'src/constants/planEntitlements.ts');
    const blockFor = (plan) => {
      const start = entitlementSource.indexOf(`  ${plan}: {`);
      const nextPlan = ['demo','basic','standard','pro'].find((candidate) => entitlementSource.indexOf(`  ${candidate}: {`, start + 1) > start);
      const end = nextPlan ? entitlementSource.indexOf(`  ${nextPlan}: {`, start + 1) : entitlementSource.indexOf('});', start);
      return entitlementSource.slice(start, end);
    };
    const demoBlock = blockFor('demo');
    assert.match(demoBlock, /'backupExport'/);
    assert.doesNotMatch(demoBlock, /'backupRestore'/);
    for (const plan of ['basic','standard','pro']) {
      const block = blockFor(plan);
      assert.match(block, /'backupExport'/);
      assert.match(block, /'backupRestore'/);
    }
    const expectedWhiteLabel = { demo: false, basic: true, standard: true, pro: true };
    const expectedPromptPay = { demo: true, basic: false, standard: true, pro: true };
    for (const packageId of ids) {
      const generatedSource = await read(roots[packageId], 'src/constants/planEntitlements.ts');
      for (const plan of ids) {
        const start = generatedSource.indexOf(`  ${plan}: {`);
        const nextIndex = ids.indexOf(plan) + 1;
        const nextPlan = nextIndex < ids.length ? ids[nextIndex] : null;
        const end = nextPlan ? generatedSource.indexOf(`  ${nextPlan}: {`, start + 1) : generatedSource.indexOf('});', start);
        const block = generatedSource.slice(start, end);
        assert.equal(/'whiteLabel'/.test(block), expectedWhiteLabel[plan], `${packageId}/${plan} whiteLabel drift`);
        assert.equal(/'promptPay'/.test(block), expectedPromptPay[plan], `${packageId}/${plan} promptPay drift`);
      }
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
