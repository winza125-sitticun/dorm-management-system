import { resolve } from 'node:path';
export const PLANS = Object.freeze(['demo', 'basic', 'standard', 'pro']);

function normalizePlan(value) {
  return String(value ?? '').trim().toLowerCase();
}

function requirePlan(value, label = 'plan') {
  const plan = normalizePlan(value);
  if (!PLANS.includes(plan)) throw new Error(`Invalid ${label}: ${value}`);
  return plan;
}

export function upgradeTargets(currentPlan) {
  const current = requirePlan(currentPlan, 'current plan');
  return PLANS.slice(PLANS.indexOf(current) + 1);
}

export function validateUpgrade(currentPlan, targetPlan) {
  const current = requirePlan(currentPlan, 'current plan');
  const target = normalizePlan(targetPlan);
  if (!PLANS.includes(target)) throw new Error(`Invalid target plan: ${targetPlan}`);
  if (PLANS.indexOf(target) <= PLANS.indexOf(current)) {
    throw new Error(`Target must be a higher plan than ${current}`);
  }
  return target;
}

export function extractSubscriptionPlans(value) {
  const found = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === 'subscription_plan' || key === 'subscriptionPlan') {
        const plan = normalizePlan(child);
        if (PLANS.includes(plan)) found.add(plan);
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return PLANS.filter((plan) => found.has(plan));
}

export function buildPlanUpdateSql(targetPlan) {
  const target = requirePlan(targetPlan, 'target plan');
  return [
    `UPDATE settings`,
    `SET subscription_plan = '${target}',`,
    `    subscription_status = 'active',`,
    `    updated_at = CURRENT_TIMESTAMP`,
    `WHERE user_id IN (`,
    `  SELECT id FROM users`,
    `  WHERE role IN ('owner', 'super_admin')`,
    `    AND deleted_at IS NULL`,
    `);`,
  ].join('\n');
}

function matchString(source, key) {
  return source.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1]?.trim() ?? '';
}

export function readDeploymentConfig(source) {
  const text = String(source ?? '');
  const projectName = matchString(text, 'name');
  const databaseName = matchString(text, 'database_name');
  const databaseId = matchString(text, 'database_id');

  if (!projectName || /^REPLACE_WITH_/.test(projectName)) throw new Error('Cloudflare Pages project is not configured');
  if (!databaseName || /^REPLACE_WITH_/.test(databaseName)) throw new Error('D1 database is not configured');
  if (!databaseId || /^0{8}-/.test(databaseId)) throw new Error('D1 database ID is not configured');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(projectName)) throw new Error('Invalid Cloudflare Pages project name');
  if (!/^[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$/.test(databaseName)) throw new Error('Invalid D1 database name');

  return { projectName, databaseName, databaseId };
}

export function commandUsesShell(bin, platform = process.platform) {
  return platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(bin));
}


export function wranglerInvocation({ root, nodeExecutable, platform = process.platform, exists }) {
  const localCli = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (exists(localCli)) return { bin: nodeExecutable, prefix: [localCli] };
  return { bin: platform === 'win32' ? 'npx.cmd' : 'npx', prefix: ['wrangler'] };
}
