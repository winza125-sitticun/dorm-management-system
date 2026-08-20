import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const expectedPlans = ['demo','basic','standard','pro'];
const publicLicenseConfig = { publicKeyBase64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', controlPlaneUrl: 'https://license.example.test' };

test('V14 release generator creates four verified customer ZIPs, QA report, and matching SHA256SUMS', async () => {
  const { generateRelease } = await import('../scripts/build-packages.mjs');
  const { verifyZipBytes } = await import('../scripts/zip-utils.mjs');
  const temp = await mkdtemp(join(tmpdir(), 'dorm-v14-release-'));
  const releaseDir = join(temp, 'release');
  const stagingRoot = join(temp, 'staging');
  try {
    const result = await generateRelease({ releaseDir, stagingRoot, runPortableTests: false, customerReady: true, publicLicenseConfig });
    assert.deepEqual(Object.keys(result.packages), expectedPlans);
    const names = (await readdir(releaseDir)).sort();
    assert.ok(names.includes('QA_REPORT_TH.md'));
    assert.ok(names.includes('SHA256SUMS.txt'));
    const sums = await readFile(join(releaseDir, 'SHA256SUMS.txt'), 'utf8');
    for (const plan of expectedPlans) {
      const filename = `dorm-management-system-${plan}-v14-CUSTOMER-READY.zip`;
      assert.ok(names.includes(filename), `${filename} missing`);
      const bytes = await readFile(join(releaseDir, filename));
      const verified = verifyZipBytes(bytes);
      assert.ok(verified.names.includes('package.json'));
      assert.ok(verified.names.includes('SETUP-WINDOWS.cmd'));
      assert.ok(verified.names.includes('UPGRADE-WINDOWS.cmd'));
      assert.ok(!verified.names.includes('wrangler.jsonc'));
      assert.ok(!verified.names.includes('wrangler.master.jsonc'));
      assert.ok(!verified.names.includes('TASK12_STATUS_TH.md'));
      assert.ok(!verified.names.includes('PREVIEW_ONLY.txt'));
      assert.ok(!verified.names.some((x) => x.startsWith('package-plans/')));
      assert.match(verified.entries.get('README.md').toString('utf8'), /Customer Delivery V14/);
      const pkg = JSON.parse(verified.entries.get('package.json').toString('utf8'));
      assert.equal(pkg.name, `dorm-management-system-${plan}`);
      assert.ok(verified.names.includes('src/server/validators/logo.ts'), `${plan} release logo validator missing`);
      assert.ok(verified.names.includes('src/server/services/branding.service.ts'), `${plan} release branding service missing`);
      assert.ok(verified.names.includes('d1-migrations/0007_add_license_state.sql'), `${plan} release license migration missing`);
      assert.equal(verified.names.some((name) => /^d1-migrations\/000[8-9]/.test(name) || /^d1-migrations\/00[1-9][0-9]/.test(name)), false, `${plan} release contains migration after V16 Task 6 ceiling 0007`);
      const pagesApi = verified.entries.get('functions/api/[[path]].ts').toString('utf8');
      assert.ok(pagesApi.includes('/api/public/branding'), `${plan} release public branding route missing`);
      assert.ok(pagesApi.includes('/api/settings/logo'), `${plan} release logo route missing`);
      const logoValidator = verified.entries.get('src/server/validators/logo.ts').toString('utf8');
      assert.match(logoValidator, /LOGO_MAX_DECODED_BYTES = 307_200/);
      assert.equal([...verified.entries.entries()].filter(([name]) => !name.startsWith('tests/')).some(([, bytes]) => bytes.toString('utf8').includes('brand_logo_data_uri')), false, `${plan} release runtime contains forbidden second logo storage field`);

      const entitlementSource = verified.entries.get('src/constants/planEntitlements.ts').toString('utf8');
      const ownStart = entitlementSource.indexOf(`  ${plan}: {`);
      const ownIndex = expectedPlans.indexOf(plan);
      const ownNext = ownIndex + 1 < expectedPlans.length ? expectedPlans[ownIndex + 1] : null;
      const ownEnd = ownNext ? entitlementSource.indexOf(`  ${ownNext}: {`, ownStart + 1) : entitlementSource.indexOf('});', ownStart);
      const ownBlock = entitlementSource.slice(ownStart, ownEnd);
      assert.equal(/'whiteLabel'/.test(ownBlock), plan !== 'demo', `${plan} release whiteLabel drift`);
      assert.equal(/'promptPay'/.test(ownBlock), plan !== 'basic', `${plan} release promptPay drift`);
      assert.match(sums, new RegExp(`[a-f0-9]{64}  ${filename.replaceAll('.', '\\.')}`));
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('default staging path is outside the Master tree so Node fs.cp can build without EINVAL', async () => {
  const { buildPackageTree, loadPlans } = await import('../scripts/build-packages.mjs');
  const plans = await loadPlans();
  const masterRoot = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
  const staged = await buildPackageTree(plans.demo, { runPortableTests: false });
  try {
    assert.equal(staged.startsWith(masterRoot + '/'), false, `staging must be outside Master: ${staged}`);
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(staged, { recursive: true, force: true });
  }
});

test('default PREVIEW generation never nests preview/release output inside later package ZIPs', async () => {
  const { generateRelease } = await import('../scripts/build-packages.mjs');
  const { verifyZipBytes } = await import('../scripts/zip-utils.mjs');
  const { readFile, rm } = await import('node:fs/promises');
  const result = await generateRelease({ customerReady: false, runPortableTests: false });
  try {
    for (const item of Object.values(result.packages)) {
      const bytes = await readFile(new URL(`../preview-v14/${item.filename}`, import.meta.url));
      const verified = verifyZipBytes(bytes);
      assert.equal(verified.names.some((x) => x.startsWith('preview-v14/') || x.startsWith('release-v14/')), false, `${item.plan.id} nested release output`);
      assert.ok(verified.names.includes('PREVIEW_ONLY.txt'));
      assert.match(verified.entries.get('README.md').toString('utf8'), /PREVIEW V14 — NOT FOR PRODUCTION/);
    }
    const sizes = Object.values(result.packages).map((x) => x.size);
    assert.ok(Math.max(...sizes) < Math.min(...sizes) * 1.25, `unexpected package size growth: ${sizes.join(',')}`);
  } finally {
    await rm(new URL('../preview-v14/', import.meta.url), { recursive: true, force: true });
  }
});


test('direct customer-ready CLI generation is blocked so full release gate cannot be bypassed', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = new URL('../scripts/build-packages.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, '--customer-ready'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /use npm run packages:release/i);
});
