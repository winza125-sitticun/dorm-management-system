import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const login = readFileSync(join(root, 'src/components/Login.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const brandTheme = readFileSync(join(root, 'src/theme/brandTheme.ts'), 'utf8');

function shellBlock() {
  const start = app.indexOf('{/* Sidebar for Desktop */}');
  const end = app.indexOf('{/* Main Content Area */}');
  assert.ok(start >= 0 && end > start, 'App shell block must be discoverable');
  return app.slice(start, end);
}

test('Login renders effective runtime dorm name and logo with Building2 fallback', () => {
  assert.match(login, /import\s+\{\s*useTheme\s*\}\s+from\s+'\.\.\/context\/ThemeContext\.tsx';/);
  assert.match(login, /const\s+\{[^}]*dormName[^}]*logoDataUri[^}]*\}\s*=\s*useTheme\(\)/s);
  assert.match(login, /logoDataUri\s*\?\s*\(/);
  assert.match(login, /<img[^>]+src=\{logoDataUri\}[^>]+alt=\{`\$\{dormName\} logo`\}/s);
  assert.match(login, /<Building2[^>]+>/);
  assert.match(login, /\{dormName\}/);
});

test('Login brand accents use runtime tokens and preserve error semantics', () => {
  assert.doesNotMatch(login, /#1DB954|#1ED760/i);
  for (const token of ['--brand-primary', '--brand-primary-hover', '--brand-soft', '--brand-contrast']) {
    assert.match(login, new RegExp(token.replaceAll('-', '\\-')));
  }
  assert.match(login, /#E22134/i, 'error red must remain semantic and not become brand color');
});

test('desktop and mobile App shell use effective runtime branding', () => {
  const shell = shellBlock();
  assert.match(app, /const\s+\{[^}]*theme[^}]*toggleTheme[^}]*dormName[^}]*logoDataUri[^}]*\}\s*=\s*useTheme\(\)/s);
  assert.doesNotMatch(shell, /settings\?\.dormName/);
  assert.doesNotMatch(shell, /#1DB954/i);
  assert.doesNotMatch(shell, /bg-emerald-500/);
  assert.match(shell, /bg-\[var\(--brand-primary\)\]/);
  assert.match(shell, /text-\[var\(--brand-contrast\)\]/);
  assert.match(shell, /logoDataUri\s*\?\s*\(/);
  assert.match(shell, /\{dormName\}/);
});

test('semantic status palette is unchanged and Task 5 adds no migration', () => {
  assert.match(brandTheme, /success:\s*'#16A34A'/);
  assert.match(brandTheme, /warning:\s*'#D97706'/);
  assert.match(brandTheme, /danger:\s*'#DC2626'/);
  assert.match(brandTheme, /info:\s*'#2563EB'/);
  assert.match(app, /hover:text-red-400/);
  assert.match(app, /text-amber-400/);
  const migrations = readdirSync(join(root, 'd1-migrations')).filter((name) => name.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1), '0006_add_white_label_settings.sql');
});
