import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const helperPath = resolve(root, 'src/utils/billApi.ts');
const appPath = resolve(root, 'src/App.tsx');

async function loadHelper() {
  assert.ok(existsSync(helperPath), 'src/utils/billApi.ts must exist');
  const source = readFileSync(helperPath, 'utf8');
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

test('findBillInApiPayload finds a bill in the current wrapped API response', async () => {
  const { findBillInApiPayload } = await loadHelper();
  const bill = findBillInApiPayload({ success: true, data: [{ id: 41, roomNumber: 'A101' }] }, 41);
  assert.equal(bill?.roomNumber, 'A101');
});

test('findBillInApiPayload keeps bare-array compatibility and normalizes string/number ids', async () => {
  const { findBillInApiPayload } = await loadHelper();
  const bill = findBillInApiPayload([{ id: '42', roomNumber: 'A102' }], 42);
  assert.equal(bill?.roomNumber, 'A102');
});

test('findBillInApiPayload returns undefined for malformed payloads instead of throwing', async () => {
  const { findBillInApiPayload } = await loadHelper();
  for (const payload of [null, undefined, {}, { data: {} }, 'bad']) {
    assert.doesNotThrow(() => findBillInApiPayload(payload, 99));
    assert.equal(findBillInApiPayload(payload, 99), undefined);
  }
});

test('dashboard bill fallback delegates API payload handling to the helper', () => {
  const app = readFileSync(appPath, 'utf8');
  const start = app.indexOf('const onViewBillById');
  const end = app.indexOf('const [isSetupRequired', start);
  assert.ok(start >= 0 && end > start, 'onViewBillById block must exist');
  const block = app.slice(start, end);
  assert.match(app, /from ['"]\.\/utils\/billApi['"];?/);
  assert.match(block, /findBillInApiPayload\(data, billId\)/);
  assert.doesNotMatch(block, /data\.find\(/);
});
