import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const FORBIDDEN_PREFIXES = [
  '.git/', 'node_modules/', 'docs/superpowers/', 'package-plans/', 'release-v13/', '.staging-v13/', 'release-v14/', '.staging-v14/',
  'backups/', 'dist/', 'dist-server/', 'assets/.aistudio/', 'preview-v13/', 'preview-v14/',
];
const FORBIDDEN_EXACT = new Set([
  '.git', 'node_modules', 'wrangler.jsonc', '.env', '.dev.vars',
  'scripts/build-packages.mjs', 'scripts/release-packages.mjs', 'scripts/package-audit.mjs', 'scripts/zip-utils.mjs',
  'tests/license-public-config.test.mjs', 'tests/package-builder.test.mjs', 'tests/package-parity.test.mjs', 'tests/package-audit.test.mjs', 'tests/package-release.test.mjs', 'tests/master-launchers.test.mjs', 'tests/zip-utils.test.mjs',
  'BUILD-PACKAGES-WINDOWS.cmd', 'BUILD-PACKAGES-ANDROID.sh', 'MASTER_PROJECT_TH.md', 'wrangler.master.jsonc', 'TASK12_STATUS_TH.md',
]);
const TEXT_EXTENSIONS = /\.(?:md|txt|json|jsonc|js|mjs|cjs|ts|tsx|sql|cmd|sh|html|css|yml|yaml|toml)$/i;
const CUSTOMER_LABEL_FILES = new Set(['README.md','SETUP_GUIDE_TH.md','CLOUDFLARE_DEPLOY_GUIDE_TH.md','CUSTOMER_DEPLOY_GUIDE_TH.md','CUSTOMER_CHECKLIST_TH.md','UPGRADE_GUIDE_TH.md','PACKAGE_VARIANT.md','DELIVERY_STATUS_TH.md','SETUP_VERSION.txt','SETUP-CLOUDFLARE.mjs','UPGRADE-WINDOWS.cmd','UPGRADE-ANDROID.sh','UPGRADE-PACKAGE.mjs','RELEASE_NOTES_V14_TH.md']);

async function walk(root, current = root, out = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const full = resolve(current, entry.name);
    const rel = relative(root, full).replaceAll('\\', '/');
    if (entry.isDirectory()) await walk(root, full, out);
    else out.push(rel);
  }
  return out;
}

export async function auditCustomerTree(root, plan) {
  const issues = [];
  const files = await walk(root);
  for (const rel of files) {
    if (FORBIDDEN_EXACT.has(rel) || FORBIDDEN_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
      issues.push(`Forbidden customer-delivery artifact: ${rel}`);
    }
    if (/^\.env(?:\.|$)/.test(rel) && rel !== '.env.example') issues.push(`Forbidden local env file: ${rel}`);
    if (/^\.dev\.vars(?:\.|$)/.test(rel) && rel !== '.dev.vars.example') issues.push(`Forbidden local dev vars file: ${rel}`);
  }

  try {
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
    if (pkg.name !== plan.packageName) issues.push(`Package name mismatch: expected ${plan.packageName}, got ${pkg.name}`);
    if (pkg.scripts?.['packages:generate'] || pkg.scripts?.['packages:release'] || pkg.scripts?.['test:builder'] || pkg.scripts?.['test:setup:master'] || pkg.scripts?.['check:cloudflare-types:master']) {
      issues.push('Customer package contains master-only package scripts');
    }
  } catch (error) {
    issues.push(`Cannot validate package.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const rel of files.filter((f) => TEXT_EXTENSIONS.test(f) || ['.dev.vars.example','.gitignore'].includes(f))) {
    let text;
    try { text = await readFile(resolve(root, rel), 'utf8'); } catch { continue; }
    if (/winza125@gmail\.com/i.test(text)) issues.push(`Developer personal email leaked: ${rel}`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) issues.push(`Private key leaked: ${rel}`);
    if (/\b(?:sk-proj|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{16,}\b/.test(text)) issues.push(`Credential-like token leaked: ${rel}`);
    if (CUSTOMER_LABEL_FILES.has(rel) && rel !== 'RELEASE_NOTES_V14_TH.md' && /\bV(?:5|6|7|8|9|10|11|12|13)\b/i.test(text)) issues.push(`Stale delivery label in ${rel}`);
  }

  const planChecks = [
    ['d1-migrations/0005_add_subscription_plan.sql', `DEFAULT '${plan.id}'`],
    ['schema_d1.sql', `DEFAULT '${plan.id}'`],
    ['src/db/schema.ts', `.default('${plan.id}').notNull()`],
    ['src/constants/planEntitlements.ts', `    : '${plan.id}';`],
    ['tests/plan-entitlements.test.ts', `assert.equal(normalizeSubscriptionPlan(null), '${plan.id}');`],
  ];
  for (const [rel, expected] of planChecks) {
    try {
      const text = await readFile(resolve(root, rel), 'utf8');
      if (!text.includes(expected)) issues.push(`Plan default mismatch in ${rel}: expected ${expected}`);
    } catch {
      issues.push(`Missing required plan file ${rel}`);
    }
  }
  try {
    const pages = await readFile(resolve(root, 'functions/api/[[path]].ts'), 'utf8');
    const expectedSchemaDefault = `subscription_plan TEXT NOT NULL DEFAULT '${plan.id}'`;
    if (!pages.includes(expectedSchemaDefault)) issues.push(`Cloudflare compatibility plan default mismatch: expected ${expectedSchemaDefault}`);
    if (!pages.includes('resolveEffectivePlan(env, ownerId)')) issues.push('Cloudflare API missing signed-license plan resolver');
    if (/subscriptionPlan: '[a-z]+' as const/.test(pages)) issues.push('Cloudflare API contains forbidden hardcoded plan authority fallback');
  } catch {
    issues.push('Missing required plan file functions/api/[[path]].ts');
  }
  try {
    const licenseConfig = await readFile(resolve(root, 'src/generated/licenseConfig.ts'), 'utf8');
    if (!licenseConfig.includes(`packagePlan: '${plan.id}'`)) issues.push(`License package plan mismatch: expected ${plan.id}`);
    if (!licenseConfig.includes(`requiresLicense: ${plan.requiresLicense ? 'true' : 'false'}`)) issues.push(`License requirement mismatch for ${plan.id}`);
    if (/PRIVATE_KEY|SIGNING_PRIVATE/i.test(licenseConfig)) issues.push('Private signing material reference leaked into customer license config');
    if (/LICENSE_SIGNING_PRIVATE_KEY/.test(licenseConfig)) issues.push('LICENSE_SIGNING_PRIVATE_KEY leaked into customer license config');
    if (plan.requiresLicense && plan.requirePublicLicenseConfig && !/publicKeyBase64:\s*['"](?!['"])[^'"]+['"]/.test(licenseConfig)) issues.push(`Paid package ${plan.id} missing publicKeyBase64`);
    if (plan.requiresLicense && plan.requirePublicLicenseConfig && !/controlPlaneUrl:\s*['"]https:\/\/[^'"]+['"]/.test(licenseConfig)) issues.push(`Paid package ${plan.id} missing HTTPS controlPlaneUrl`);
  } catch {
    issues.push('Missing required license config src/generated/licenseConfig.ts');
  }

  return [...new Set(issues)];
}
