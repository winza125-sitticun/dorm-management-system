import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowPath = resolve(process.cwd(), '.github/workflows/v15-task8-customer-ready-closure-v2.yml');

test('CUSTOMER-READY closure waits for Pages Functions API, not only static root', () => {
  const source = readFileSync(workflowPath, 'utf8');
  assert.match(source, /\/api\/setup\/status/);
  assert.match(source, /isSetupRequired/);
  assert.match(source, /API readiness/);
  assert.doesNotMatch(source, /ready=\"\$url\"; break 2[\s\S]{0,300}echo \"DEMO_URL=\$ready\"/);
});
