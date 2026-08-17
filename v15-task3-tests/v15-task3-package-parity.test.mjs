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

test('Task 3 adds no migration after 0006', () => {
  for (const plan of plans) {
    const migrations = listZip(zipFor(plan)).filter((entry) => entry.startsWith('d1-migrations/'));
    assert.equal(migrations.some((entry) => /\/0007_/.test(entry)), false, `${plan}: unexpected 0007 migration`);
  }
});
