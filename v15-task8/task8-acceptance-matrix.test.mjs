import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const testFile = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

const task5 = testFile('./task5-login-app-shell-branding.test.mjs');
const task6 = testFile('./task6-bill-branding.test.mjs');
const task7 = testFile('./task7-tenant-portal-branding.test.mjs');
const brandTheme = testFile('./brand-theme-runtime.test.ts');
const brandingClient = testFile('./branding-client-runtime.test.ts');
const settings = testFile('./settings-white-label.test.ts');
const logoValidation = testFile('./logo-validation.test.ts');
const whiteLabelUi = testFile('./white-label-settings-ui-utils.test.ts');
const publicBranding = testFile('./public-branding.test.ts');
const plans = testFile('./plan-entitlements.test.ts');
const billSnapshot = testFile('./bill-branding-snapshot.test.ts');

function must(source, patterns, label) {
  for (const pattern of patterns) {
    assert.match(source, pattern, `${label}: missing ${pattern}`);
  }
}

test('AC-01 cross-surface dorm identity is covered by Login/App/Bill/Portal contracts', () => {
  must(task5, [/Login/, /desktop/i, /mobile/i, /dormName/], 'Task 5');
  must(task6, [/BillInvoice/, /dormName/, /toJpeg/, /print|PDF|พิมพ์/i], 'Task 6');
  must(task7, [/TenantPortalView/, /dormName/, /lookup/i, /active/i], 'Task 7');
});

test('AC-02 logo parity and fallback are covered without Demo paid-logo leakage', () => {
  must(task5, [/logoDataUri/, /logo/], 'Task 5 logo');
  must(task6, [/logoDataUri/, /logoFailed|fallback/i], 'Task 6 logo fallback');
  must(task7, [/logoDataUri/, /TenantPortalView/], 'Task 7 logo');
  must(brandingClient, [/masks Demo paid branding while preserving dorm name/i, /logoDataUri:\s*null/], 'Demo runtime logo masking');
  must(billSnapshot, [/logoDataUri:\s*null/, /whiteLabelEnabled:\s*false/], 'Bill Demo masking');
});

test('AC-03 brand matrix preserves default/red/dark behavior and frozen semantic palette', () => {
  must(brandTheme, [/#1DB954/, /#FF0000/, /#000000/, /#FFFFFF/, /semantic status colors are brand-independent and frozen/i], 'brand theme');
  must(brandTheme, [/#16A34A/, /#D97706/, /#DC2626/, /#2563EB/], 'semantic tokens');
});

test('AC-04 exact HEX validation and uppercase canonicalization are covered', () => {
  must(settings, [/#1db954/, /#1DB954/, /rejects invalid brandColor/, /#12345/, /#GGGGGG/], 'settings HEX validation');
});

test('AC-05 logo validation covers PNG JPEG WebP and rejects SVG and >300KB', () => {
  must(logoValidation, [/image\/png/, /image\/jpeg/, /image\/webp/, /SVG/, /LOGO_MAX_DECODED_BYTES \+ 1/], 'server logo validation');
  must(whiteLabelUi, [/WHITE_LABEL_LOGO_MAX_BYTES, 307_200/, /image\/svg\+xml/, /WHITE_LABEL_LOGO_MAX_BYTES \+ 1/], 'UI logo validation');
});

test('AC-06 public branding keeps an explicit safe projection and secret boundary', () => {
  must(publicBranding, [/does not leak extra settings, payment, integration, auth, or license fields/i, /PROMPTPAY_SECRET_SENTINEL/, /LINE_TOKEN_SENTINEL/, /GOOGLE_REFRESH_SENTINEL/, /LICENSE_KEY_SENTINEL/], 'public branding secret boundary');
});

test('AC-07 public branding failures exit to safe fallback instead of hanging', () => {
  must(brandingClient, [/fetch falls back on HTTP and rejected request/i, /BRANDING_TIMEOUT_MS, 3000/, /source:\s*'fallback'/], 'branding client fallback');
  const app = read('src/App.tsx');
  const theme = read('src/context/ThemeContext.tsx');
  must(app, [/brandingLoading/, /BrandingBootScreen/], 'App boot gate');
  must(theme, [/fetchPublicBranding\(\)\.then/, /setBrandingLoading\(false\)/], 'Theme boot exit');
});

test('AC-08 default identity remains locked to the approved fallback', () => {
  must(brandTheme, [/default brand constants stay locked/i, /#1DB954/, /หอพักของฉัน/], 'default branding');
  must(brandingClient, [/fallback is explicit and timeout is fixed/i, /#1DB954/, /หอพักของฉัน/], 'client fallback');
});

test('AC-09 plan entitlement matrix is Demo false and Basic Standard Pro true while PromptPay stays independent', () => {
  must(plans, [/hasPlanFeature\('demo', 'whiteLabel'\), false/, /hasPlanFeature\('basic', 'whiteLabel'\), true/, /hasPlanFeature\('standard', 'whiteLabel'\), true/, /hasPlanFeature\('pro', 'whiteLabel'\), true/], 'white-label entitlements');
  must(plans, [/hasPlanFeature\('demo', 'promptPay'\), true/, /hasPlanFeature\('basic', 'promptPay'\), false/, /hasPlanFeature\('standard', 'promptPay'\), true/, /hasPlanFeature\('pro', 'promptPay'\), true/], 'PromptPay entitlements');
});

test('AC-10 clearing optional white-label values produces safe reset/masked output', () => {
  must(settings, [/empty optional white-label strings normalize to null/i, /brandColor:\s*null/, /contactPhone:\s*null/, /billFooter:\s*null/], 'settings clear');
  must(whiteLabelUi, [/normalizes empty optional white-label values to null/i, /brandColor:\s*null/, /contactPhone:\s*null/, /billFooter:\s*null/], 'UI clear');
  must(billSnapshot, [/brandColor, '#1DB954'/, /logoDataUri, null/, /contactPhone, null/, /billFooter, null/], 'bill safe fallback');
});

test('release migration ceiling remains 0006_add_white_label_settings.sql', () => {
  const names = readdirSync(new URL('../d1-migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort();
  assert.equal(names.at(-1), '0006_add_white_label_settings.sql');
});
