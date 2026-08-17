import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const plans = ['demo', 'basic', 'standard', 'pro'];
const runtimeFiles = [
  'src/theme/brandTheme.ts',
  'src/theme/brandingClient.ts',
  'src/context/ThemeContext.tsx',
  'src/components/BrandingBootScreen.tsx',
  'src/App.tsx',
  'src/index.css',
];

function zipFor(plan) {
  return path.join(root, 'release-v14', `dorm-management-system-${plan}-v14-CUSTOMER-READY.zip`);
}

function readZipEntry(zip, entry) {
  return execFileSync('unzip', ['-p', zip, entry], { encoding: 'utf8' });
}

function listZip(zip) {
  return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
}

function entitlementSection(source, plan) {
  const order = ['demo', 'basic', 'standard', 'pro'];
  const index = order.indexOf(plan);
  const start = source.search(new RegExp(`\\b${plan}:\\s*\\{`));
  assert.notEqual(start, -1, `missing ${plan} entitlement start`);
  if (index === order.length - 1) return source.slice(start);
  const nextPlan = order[index + 1];
  const tail = source.slice(start + 1);
  const nextOffset = tail.search(new RegExp(`\\b${nextPlan}:\\s*\\{`));
  assert.notEqual(nextOffset, -1, `missing ${nextPlan} entitlement boundary`);
  return source.slice(start, start + 1 + nextOffset);
}

test('all four packages contain byte-identical Task 3 runtime files', () => {
  for (const plan of plans) assert.ok(fs.existsSync(zipFor(plan)), `missing ${plan} package`);
  for (const file of runtimeFiles) {
    const master = fs.readFileSync(path.join(root, file), 'utf8');
    for (const plan of plans) assert.equal(readZipEntry(zipFor(plan), file), master, `${plan}: ${file} differs`);
  }
});

test('Task 3 runtime is identical across generated plans', () => {
  for (const file of runtimeFiles) {
    const expected = readZipEntry(zipFor('pro'), file);
    for (const plan of plans) assert.equal(readZipEntry(zipFor(plan), file), expected, `${plan}: ${file} runtime drift`);
  }
});

test('white-label entitlement matrix stays Demo false and paid true', () => {
  for (const packagePlan of plans) {
    const source = readZipEntry(zipFor(packagePlan), 'src/constants/planEntitlements.ts');
    for (const entitlementPlan of plans) {
      const section = entitlementSection(source, entitlementPlan);
      const enabled = /whiteLabel:\s*true/.test(section);
      assert.equal(enabled, entitlementPlan !== 'demo', `${packagePlan}: ${entitlementPlan} whiteLabel mismatch`);
    }
  }
});

test('Task 3 adds no migration after 0006', () => {
  for (const plan of plans) {
    const migrations = listZip(zipFor(plan)).filter((entry) => entry.startsWith('d1-migrations/'));
    assert.equal(migrations.some((entry) => /\/0007_/.test(entry)), false, `${plan}: unexpected 0007 migration`);
  }
});
