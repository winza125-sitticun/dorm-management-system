import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bill = readFileSync(join(root, 'src/components/BillInvoice.tsx'), 'utf8');
const snapshotPath = join(root, 'src/utils/billBranding.ts');
const snapshot = (() => { try { return readFileSync(snapshotPath, 'utf8'); } catch { return ''; } })();

test('BillInvoice consumes one effective runtime branding snapshot for preview print and JPG', () => {
  assert.match(bill, /import\s+\{\s*useTheme\s*\}\s+from\s+'\.\.\/context\/ThemeContext\.tsx';/);
  assert.match(bill, /resolveBillBrandingSnapshot/);
  assert.match(bill, /const\s+\{[^}]*dormName[^}]*brandColor[^}]*contactPhone[^}]*logoDataUri[^}]*whiteLabelEnabled[^}]*\}\s*=\s*useTheme\(\)/s);
  assert.match(bill, /toJpeg\(printAreaRef\.current,/);
  assert.match(bill, /border:\s*2\.5px solid \$\{branding\.brandColor\}/);
  assert.doesNotMatch(bill, /#166534/i);
});

test('bill branding snapshot masks paid fields when white-label is disabled', () => {
  assert.match(snapshot, /export\s+function\s+resolveBillBrandingSnapshot/);
  assert.match(snapshot, /whiteLabelEnabled\s*\?/);
  assert.match(snapshot, /billFooter/);
  assert.match(snapshot, /logoDataUri/);
  assert.match(snapshot, /contactPhone/);
  assert.match(snapshot, /brandColor/);
});

test('BillInvoice renders logo fallback footer and contact from the snapshot', () => {
  assert.match(bill, /branding\.logoDataUri\s*&&/);
  assert.match(bill, /onError=/);
  assert.match(bill, /<Home[^>]*>/);
  assert.match(bill, /branding\.billFooter/);
  assert.match(bill, /branding\.contactPhone/);
  assert.doesNotMatch(bill, /settings\.dormName/);
});

test('Task 6 keeps semantic utility colors and adds no migration', () => {
  assert.match(bill, /text-amber-/);
  assert.match(bill, /text-blue-/);
  assert.match(bill, /bg-purple-/);
  assert.match(bill, /bg-cyan-/);
  const migrations = readdirSync(join(root, 'd1-migrations')).filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '0006_add_white_label_settings.sql');
});
