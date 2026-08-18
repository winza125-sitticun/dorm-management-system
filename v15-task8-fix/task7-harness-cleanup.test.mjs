import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const harnessPath = resolve(process.cwd(), 'v15-task8-fix/portal-branding-smoke-v2.mjs');

test('Task 8 portal smoke waits for Chrome exit and treats temp-profile cleanup as teardown', () => {
  const source = readFileSync(harnessPath, 'utf8');
  assert.match(source, /proc\.kill\('SIGKILL'\);\s*await Promise\.race\(\[new Promise\(r=>proc\.once\('exit',r\)\),sleep\(2000\)\]\);/s);
  assert.match(source, /rm\(profile,\{recursive:true,force:true,maxRetries:5,retryDelay:100\}\)/);
  assert.match(source, /console\.warn\(`profile cleanup warning:/);
});
