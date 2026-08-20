import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const portal = readFileSync(join(root, 'src/components/TenantPortalView.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

function block(startMarker, endMarker) {
  const start = portal.indexOf(startMarker);
  const end = portal.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `block must exist: ${startMarker}`);
  return portal.slice(start, end);
}

test('Tenant Portal consumes effective runtime branding for public lookup and active header', () => {
  assert.match(portal, /import\s+\{\s*useTheme\s*\}\s+from\s+'\.\.\/context\/ThemeContext\.tsx';/);
  assert.match(portal, /const\s+\{[^}]*dormName[^}]*logoDataUri[^}]*\}\s*=\s*useTheme\(\)/s);
  assert.doesNotMatch(portal, /settings\?\.dormName/);

  const lookup = block('// Render Room Search / Lookup interface', '// Render Active Tenant Portal Dashboard');
  assert.match(lookup, /logoDataUri\s*\?\s*\(/);
  assert.match(lookup, /<img[^>]+src=\{logoDataUri\}[^>]+alt=\{`\$\{dormName\} logo`\}/s);
  assert.match(lookup, /<Building2[^>]+>/);
  assert.match(lookup, /\{dormName\}/);

  const active = block('// Render Active Tenant Portal Dashboard', '/* Action alerts */');
  assert.match(active, /logoDataUri\s*\?\s*\(/);
  assert.match(active, /\{dormName\}/);
});

test('Tenant Portal brand-facing lookup and header use runtime brand tokens instead of blue/indigo identity', () => {
  const lookup = block('// Render Room Search / Lookup interface', '// Render Active Tenant Portal Dashboard');
  assert.doesNotMatch(lookup, /from-blue-|to-indigo-|from-indigo-|to-blue-|focus:ring-blue-|border-blue-|text-blue-/);
  assert.match(lookup, /var\(--brand-primary\)/);
  assert.match(lookup, /var\(--brand-soft\)/);
  assert.match(lookup, /var\(--brand-contrast\)/);

  const header = block('/* Main Header Card */', '/* Action alerts */');
  assert.doesNotMatch(header, /bg-indigo-|text-indigo-|from-blue-|to-indigo-/);
  assert.match(header, /var\(--brand-primary\)/);
  assert.match(header, /var\(--brand-soft\)/);
});

test('public and login surfaces remain behind branding boot gate with fallback-safe ThemeProvider', () => {
  assert.match(app, /function\s+BrandingBootGate/);
  assert.match(app, /if\s*\(brandingLoading\)\s*return\s*<BrandingBootScreen\s*\/?>/);
  assert.match(app, /<ThemeProvider>[\s\S]*<BrandingBootGate>[\s\S]*<AppSurface\s*\/>/);
  assert.match(app, /if\s*\(appSurface\s*===\s*'tenant_portal'\)[\s\S]*return\s*<TenantPortalView\s*\/>/);
});

test('Task 7 preserves semantic status colors and adds no migration', () => {
  assert.match(portal, /bg-amber-500/);
  assert.match(portal, /text-\[#E22134\]/i);
  assert.match(portal, /bg-emerald-500/);
  assert.match(portal, /#6366F1/i);
  const migrations = readdirSync(join(root, 'd1-migrations')).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(migrations.includes('0006_add_white_label_settings.sql'));
  assert.equal(migrations.at(-1), '0007_add_license_state.sql');
  assert.equal(migrations.some((name) => /^000[8-9]_/.test(name) || /^00[1-9][0-9]_/.test(name)), false);
});
