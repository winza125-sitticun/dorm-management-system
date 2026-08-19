# V16 Task 2 License State Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the customer-side `license_state` persistence foundation, stable installation UUID bootstrap, backup/restore exclusion, and exact `0007` package migration parity without enabling runtime license enforcement.

**Architecture:** Reconstruct the exact V16 Task 1 REVIEW Master from artifact `9345425396`, apply tests first, then apply the minimum product changes. `license_state` remains a singleton installation/security table separate from `settings`; application code creates the installation identity with `crypto.randomUUID()`, while D1 enforces the singleton row using `CHECK(id = 1)` and `INSERT OR IGNORE`. Backup/restore remains a business-data mechanism and never exports or rewinds installation identity or cached license state.

**Tech Stack:** TypeScript 5.8, Node/tsx test runner, Cloudflare D1/SQLite, Drizzle ORM, Wrangler 4, GitHub Actions, existing Master package builder/audit tooling.

**Spec:** `docs/superpowers/specs/2026-08-19-v16-task2-license-state-bootstrap-design.md`

## Global Constraints

- Baseline artifact is exactly GitHub Actions artifact `9345425396` from run `32194605439`.
- Baseline artifact digest is exactly `sha256:56f5be6a25f0d831d3ac611d4cce531213a6704da772ad28ee3bccc0a7654001`.
- Baseline Master SHA-256 is exactly `6551a8778f39e5f1a3dd7c2cbc18655a316c29906d02d0df428dd00d6ac522eb`.
- Pre-change migration ceiling is exactly `0006_add_white_label_settings.sql`.
- Post-change migration ceiling is exactly `0007_add_license_state.sql`; no `0008` is allowed.
- `updated_at` is `TEXT NOT NULL` with no invented schema default; bootstrap supplies `new Date().toISOString()`.
- Task 2 must not change `settings.subscription_plan`, `PLAN_ENTITLEMENTS`, runtime plan guards, Demo mutation behavior, activation APIs, signing/verifying keys, grace logic, or read-only enforcement.
- `license_state` must not enter `.dormbackup` payloads and restore must never mutate it.
- Task 1 `requiresLicense`, `control-plane/` exclusion, and private signing identifier audit must remain green.
- Outputs are REVIEW/PREVIEW only with `customer_ready=false`.

---

### Task 1: Add migration and schema contract

**Files:**
- Create: `d1-migrations/0007_add_license_state.sql`
- Modify: `schema_d1.sql`
- Modify: `src/db/schema.ts`
- Create: `tests/license-state-migration.test.mjs`
- Modify: `tests/package-release.test.mjs`
- Modify: `tests/package-parity.test.mjs`
- Modify: `tests/task5-login-app-shell-branding.test.mjs`
- Modify: `tests/task6-bill-branding.test.mjs`
- Modify: `tests/task7-tenant-portal-branding.test.mjs`

**Interfaces:**
- Consumes: Task 1 Master migration set ending at `0006_add_white_label_settings.sql`.
- Produces: D1 table `license_state`; Drizzle export `licenseState`; exact migration ceiling `0007_add_license_state.sql`.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/license-state-migration.test.mjs` that reads `d1-migrations`, `schema_d1.sql`, and `src/db/schema.ts` and asserts:

```js
assert.equal(migrations.at(-1), '0007_add_license_state.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS license_state/i);
assert.match(migration, /id INTEGER PRIMARY KEY CHECK\s*\(id = 1\)/i);
assert.match(migration, /installation_id TEXT NOT NULL/i);
assert.match(migration, /status TEXT NOT NULL DEFAULT 'unlicensed'/i);
assert.match(migration, /control_plane_url TEXT NOT NULL/i);
assert.match(migration, /updated_at TEXT NOT NULL/i);
assert.doesNotMatch(migration, /updated_at TEXT NOT NULL DEFAULT/i);
assert.match(schemaD1, /CREATE TABLE IF NOT EXISTS license_state/i);
assert.match(drizzleSchema, /export const licenseState = sqliteTable\('license_state'/);
```

Also update the five existing migration-ceiling assertions to expect `0007_add_license_state.sql`; change no branding assertions.

- [ ] **Step 2: Run the RED test and verify the failure reason**

Run:

```bash
node --test tests/license-state-migration.test.mjs tests/package-release.test.mjs tests/package-parity.test.mjs tests/task5-login-app-shell-branding.test.mjs tests/task6-bill-branding.test.mjs tests/task7-tenant-portal-branding.test.mjs
```

Expected: failure because `0007_add_license_state.sql` and `licenseState` do not exist yet, not because of syntax/import errors.

- [ ] **Step 3: Implement the minimum schema change**

Create `d1-migrations/0007_add_license_state.sql` with exactly:

```sql
CREATE TABLE IF NOT EXISTS license_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  installation_id TEXT NOT NULL,
  signed_token TEXT,
  status TEXT NOT NULL DEFAULT 'unlicensed',
  effective_plan TEXT,
  last_checked_at TEXT,
  grace_until TEXT,
  expires_at TEXT,
  control_plane_url TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Append the equivalent table to `schema_d1.sql`. Add this mapping to `src/db/schema.ts` using the existing `sqliteTable`, `integer`, and `text` imports:

```ts
export const licenseState = sqliteTable('license_state', {
  id: integer('id').primaryKey(),
  installationId: text('installation_id').notNull(),
  signedToken: text('signed_token'),
  status: text('status').default('unlicensed').notNull(),
  effectivePlan: text('effective_plan'),
  lastCheckedAt: text('last_checked_at'),
  graceUntil: text('grace_until'),
  expiresAt: text('expires_at'),
  controlPlaneUrl: text('control_plane_url').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

- [ ] **Step 4: Run the focused migration/schema tests**

Run the Step 2 command again. Expected: all listed tests pass and the migration ceiling is exactly `0007_add_license_state.sql`.

- [ ] **Step 5: Record the schema task checkpoint**

Capture `sha256sum d1-migrations/0007_add_license_state.sql` for later four-package parity verification.

---

### Task 2: Add stable installation bootstrap service

**Files:**
- Create: `src/server/services/license.service.ts`
- Create: `tests/license-state-service.test.ts`

**Interfaces:**
- Produces: `LicenseStateRow`, `LicenseD1StatementLike`, `LicenseD1DatabaseLike`, `readLicenseState(db)`, `ensureLicenseState(db, controlPlaneUrl)`.
- `ensureLicenseState` returns the persisted singleton and never rotates an existing installation identity.

- [ ] **Step 1: Write RED tests against the specified service API**

Create a stateful fake D1 implementation that recognizes the service's singleton SELECT and INSERT statements. Tests must assert:

```ts
const first = await ensureLicenseState(db, ' https://license.example.test ');
assert.equal(first.id, 1);
assert.match(first.installationId, /^[0-9a-f-]{36}$/i);
assert.equal(first.status, 'unlicensed');
assert.equal(first.controlPlaneUrl, 'https://license.example.test');
assert.ok(!Number.isNaN(Date.parse(first.updatedAt)));

const second = await ensureLicenseState(db, 'https://different.example.test');
assert.equal(second.installationId, first.installationId);
assert.equal(second.controlPlaneUrl, first.controlPlaneUrl);
```

Also assert whitespace-only URL rejects before INSERT, malformed existing rows reject instead of being replaced, and two concurrent first calls converge on the one row accepted by `INSERT OR IGNORE`.

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test tests/license-state-service.test.ts
```

Expected: fail because `src/server/services/license.service.ts` does not exist.

- [ ] **Step 3: Implement row normalization and read primitive**

Implement `readLicenseState(db)` with a singleton query:

```sql
SELECT id, installation_id, signed_token, status, effective_plan,
       last_checked_at, grace_until, expires_at, control_plane_url, updated_at
FROM license_state WHERE id = 1 LIMIT 1
```

Map snake_case columns to `LicenseStateRow`. Reject a stored row unless `id === 1` and `installation_id`, `status`, `control_plane_url`, and `updated_at` are non-empty strings.

- [ ] **Step 4: Implement race-safe `ensureLicenseState`**

Behavior must be exactly:

```ts
const normalizedUrl = controlPlaneUrl.trim();
if (!normalizedUrl) throw new Error('LICENSE_CONTROL_PLANE_URL_REQUIRED');
const existing = await readLicenseState(db);
if (existing) return existing;
const installationId = crypto.randomUUID();
const updatedAt = new Date().toISOString();
await db.prepare(`INSERT OR IGNORE INTO license_state
  (id, installation_id, status, control_plane_url, updated_at)
  VALUES (?, ?, ?, ?, ?)`)
  .bind(1, installationId, 'unlicensed', normalizedUrl, updatedAt)
  .run();
const persisted = await readLicenseState(db);
if (!persisted) throw new Error('LICENSE_STATE_BOOTSTRAP_FAILED');
return persisted;
```

Do not add refresh, update, token, plan, signer, verifier, or runtime guard behavior.

- [ ] **Step 5: Run GREEN and repeat concurrency test**

Run:

```bash
npx tsx --test tests/license-state-service.test.ts
```

Expected: all bootstrap/read tests pass with one stable persisted identity.

---

### Task 3: Exclude license state from Backup/Restore

**Files:**
- Modify: `src/server/services/backup.service.ts`
- Modify: `tests/backup-export.test.ts`
- Modify: `tests/backup-restore.test.ts`

**Interfaces:**
- Consumes: existing `BACKUP_EXCLUDED`, `BACKUP_TABLES`, `RESTORE_DELETE_ORDER`, `RESTORE_INSERT_ORDER`.
- Produces: explicit manifest exclusion `license_state` with no backup payload or restore mutation support.

- [ ] **Step 1: Write RED backup and restore regression assertions**

Update `tests/backup-export.test.ts` so `manifest.excluded` includes `'license_state'`, and assert collected SQL never contains `FROM license_state`.

Update `tests/backup-restore.test.ts` to assert:

```ts
assert.equal(RESTORE_DELETE_ORDER.includes('license_state' as never), false);
assert.equal(RESTORE_INSERT_ORDER.includes('license_state' as never), false);
```

and, after a restore operation using the fake D1 statement log, assert no statement matches:

```ts
/\b(?:DELETE\s+FROM|INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE)\s+license_state\b/i
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test tests/backup-export.test.ts tests/backup-restore.test.ts
```

Expected: backup manifest exclusion assertion fails because `license_state` is not yet in `BACKUP_EXCLUDED`.

- [ ] **Step 3: Add only the explicit backup exclusion**

Add `'license_state'` to `BACKUP_EXCLUDED` in `src/server/services/backup.service.ts`. Do not add it to `BACKUP_TABLES`, backup DTOs, restore order arrays, or settings snapshots.

- [ ] **Step 4: Run backup/restore GREEN plus existing backup suite**

Run:

```bash
npx tsx --test tests/backup-export.test.ts tests/backup-archive.test.ts tests/backup-validation.test.ts tests/backup-restore.test.ts tests/backup-restore-api.test.ts
```

Expected: all pass; backup format/schema version remains unchanged.

---

### Task 4: Prove package parity and preserve Task 1 boundaries

**Files:**
- Modify: `tests/package-parity.test.mjs`
- Modify: `tests/package-release.test.mjs`
- Modify only if needed: `scripts/build-packages.mjs`, `scripts/package-audit.mjs`

**Interfaces:**
- Consumes: builder-generated Demo/Basic/Standard/Pro trees.
- Produces: byte-identical `0007` and identical `license.service.ts` across all four customer packages while retaining plan-specific `requiresLicense` values.

- [ ] **Step 1: Add RED parity assertions before changing builder behavior**

Extend package parity/release assertions to require each plan output to contain:

```text
d1-migrations/0007_add_license_state.sql
src/server/services/license.service.ts
```

Read the migration and service bytes from each generated tree and compare all four to the Demo baseline. Continue asserting `control-plane/` is absent and no `LICENSE_SIGNING_PRIVATE_KEY` marker is present.

- [ ] **Step 2: Run builder tests in RED/GREEN context**

Run:

```bash
node --test tests/package-builder.test.mjs tests/package-parity.test.mjs tests/package-audit.test.mjs tests/package-release.test.mjs
```

If these tests pass without builder changes after Tasks 1-3, keep builder/audit production code unchanged. If a new Task 2 test file is identified as Master-only by existing delivery policy and leaks into customer trees, add only that exact test path to both builder/audit Master-only lists and prove the new exclusion with a failing test first.

- [ ] **Step 3: Generate all four PREVIEW packages**

Run:

```bash
node scripts/build-packages.mjs --preview
```

Verify all four generated trees/ZIPs contain `0007`, identical migration/service bytes, correct `requiresLicense`, no migration after `0007`, no `control-plane/`, and no signing-private marker.

---

### Task 5: Produce reproducible Task 2 test and implementation patches

**Files:**
- Create: `v16-task2-patches/001-tests.patch`
- Create: `v16-task2-patches/002-implementation.patch`

**Interfaces:**
- Consumes: pristine Task 1 Master artifact and completed Task 2 worktree.
- Produces: two exact patches that reproduce intended RED then GREEN from immutable Task 1 bytes.

- [ ] **Step 1: Split changes into tests-only and implementation patches**

`001-tests.patch` must contain only tests and existing test expectation updates. `002-implementation.patch` must contain migration/schema/service/backup production changes and any production builder/audit change proven necessary by Task 4.

- [ ] **Step 2: Prove tests-only patch is RED on a pristine Task 1 copy**

Extract the exact Task 1 Master SHA into a fresh directory, apply `001-tests.patch`, then run focused Task 2 tests. Expected: non-zero exit with failures caused by missing `0007`, service, and backup exclusion.

- [ ] **Step 3: Prove implementation patch is GREEN**

Apply `002-implementation.patch` to the same tree and rerun focused Task 2 tests. Expected: zero failures.

- [ ] **Step 4: Record exact patch hashes**

Run:

```bash
sha256sum v16-task2-patches/001-tests.patch v16-task2-patches/002-implementation.patch
```

Store these exact hashes in the Task 2 workflow.

---

### Task 6: Add immutable GitHub Actions REVIEW gate and close Task 2

**Files:**
- Create: `.github/workflows/v16-task2-license-state-gate.yml`
- Create/update by workflow: `v16-task2-evidence/task2-gate-latest.txt`

**Interfaces:**
- Consumes: artifact `9345425396`, exact Task 1 Master hash, exact Task 2 patch hashes.
- Produces: V16 Task 2 REVIEW artifact and evidence with `customer_ready=false`.

- [ ] **Step 1: Build workflow lineage verification**

The workflow must checkout `agent/v16-task2-license-state-bootstrap`, verify patch SHA-256 values, download artifact `9345425396`, verify outer digest and Master SHA, and verify pre-patch migration ceiling `0006_add_white_label_settings.sql`.

- [ ] **Step 2: Reproduce RED then GREEN in CI**

Apply `001-tests.patch`, run the focused Task 2 tests and require the intended non-zero RED state. Then apply `002-implementation.patch` and require focused GREEN plus exact post-patch migration ceiling `0007_add_license_state.sql`.

- [ ] **Step 3: Run D1 fresh and upgrade smoke**

Using Wrangler local D1 with an isolated temporary config/database:

- apply migrations `0000` through `0007` to a fresh DB; verify `license_state` columns and zero rows;
- apply through `0006`, seed representative `settings` and one business row, then apply `0007`; verify seed data is unchanged and `license_state` starts empty.

Do not use production D1 or modify customer data.

- [ ] **Step 4: Run full release-quality non-CUSTOMER-READY checks**

Run:

```bash
npm ci
npm test
npm run lint
npm run check:cloudflare-types:master
npm run build:pages
npm run build:vps
npm run packages:generate
```

Audit all PREVIEW ZIPs for integrity, exact `0007` parity, Task 1 vendor/security boundaries, and migration ceiling.

- [ ] **Step 5: Upload REVIEW artifact and evidence**

Package the Task 2 Master REVIEW ZIP plus four PREVIEW ZIPs and a SHA-256 manifest. Upload artifact name `v16-task2-license-state-review`. Write evidence containing at minimum:

```text
run_id=<run>
run_attempt=<attempt>
source_sha=<sha>
job_status=success|failure
base_artifact_id=9345425396
base_artifact_sha256=56f5be6a25f0d831d3ac611d4cce531213a6704da772ad28ee3bccc0a7654001
base_master_sha256=6551a8778f39e5f1a3dd7c2cbc18655a316c29906d02d0df428dd00d6ac522eb
migration_ceiling=0007_add_license_state.sql
customer_ready=false
```

- [ ] **Step 6: Independent closure verification before completion claim**

Download the uploaded REVIEW artifact independently, verify its outer digest, manifest, all five inner ZIP hashes, `unzip -t`, exact `0007` parity, presence of `license.service.ts`, correct `requiresLicense` values, and absence of `0008`, `control-plane/`, private signing marker, `.env`, and `.dev.vars`.

Only after this fresh verification may Task 2 be reported complete in REVIEW status.

## Self-review result

- Spec coverage: migration/schema, bootstrap identity, concurrency behavior, backup/restore exclusion, migration ceiling updates, four-package parity, immutable Task 1 lineage, D1 fresh/upgrade smoke, full regression/build checks, REVIEW-only output are all mapped to tasks above.
- Placeholder scan: no TBD/TODO/"implement later" steps remain.
- Type consistency: plan uses exactly `LicenseStateRow`, `LicenseD1StatementLike`, `LicenseD1DatabaseLike`, `readLicenseState`, and `ensureLicenseState` from the approved spec.
- Scope: no activation, signing, effective-plan authority, grace/read-only, UI, Control Plane service, or dependency hardening work is included.