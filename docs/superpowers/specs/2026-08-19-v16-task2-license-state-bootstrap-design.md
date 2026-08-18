# V16 Task 2 — License State Schema + Installation Bootstrap Design

**Date:** 2026-08-19

**Parent design:** `V16_LICENSE_ACTIVATION_DESIGN.md` dated 2026-08-16.

**Parent implementation:** V16 Task 1 — License Contract + Vendor Boundary Gate.

## Goal

Add the customer-side persistence foundation required by V16 License/Activation: a singleton `license_state` table, a stable installation identity created with `crypto.randomUUID()`, and a small server-side bootstrap/read service. Task 2 must not change plan authority or customer runtime permissions yet.

## Source-derived requirements

The V16 parent design requires a customer-side table separate from `settings` with the following fields:

```text
id INTEGER PRIMARY KEY CHECK(id = 1)
installation_id TEXT NOT NULL
signed_token TEXT NULL
status TEXT NOT NULL DEFAULT 'unlicensed'
effective_plan TEXT NULL
last_checked_at TEXT NULL
grace_until TEXT NULL
expires_at TEXT NULL
control_plane_url TEXT NOT NULL
updated_at TEXT NOT NULL
```

The parent design also requires `installation_id` to be generated with `crypto.randomUUID()` on first creation and persisted in D1.

The V14 Backup/Restore design defines application backup as business-state backup for the same installation and explicitly excludes auth, integration credentials, operational metadata, and other state that should not be rewound by restore.

## Immutable Task 1 baseline

Task 2 must reconstruct its implementation candidate from the successful Task 1 REVIEW artifact, not from `main`, V13, V15 CUSTOMER-READY directly, or a mutable working tree.

- Task 1 workflow run: `32194605439`
- Task 1 artifact ID: `9345425396`
- Task 1 artifact digest: `sha256:56f5be6a25f0d831d3ac611d4cce531213a6704da772ad28ee3bccc0a7654001`
- Task 1 Master REVIEW SHA-256: `6551a8778f39e5f1a3dd7c2cbc18655a316c29906d02d0df428dd00d6ac522eb`
- Task 1 artifact status: REVIEW only; `customer_ready=false`
- Task 1 migration ceiling: `0006_add_white_label_settings.sql`

Task 2 changes the migration ceiling to exactly `0007_add_license_state.sql`.

## Scope

Task 2 consists of five related changes:

1. Add migration `d1-migrations/0007_add_license_state.sql`.
2. Add the same table contract to `schema_d1.sql` and Drizzle schema mapping in `src/db/schema.ts`.
3. Add a focused `src/server/services/license.service.ts` containing only customer-side state bootstrap/read primitives.
4. Explicitly classify `license_state` as installation/security metadata excluded from V14 application backup/restore.
5. Update migration-ceiling/package-parity regressions so all four customer packages ship the identical `0007` migration.

Task 2 does not implement license verification, activation, refresh, deactivation, effective-plan authority, read-only enforcement, or License UI.

## Database migration

Create `d1-migrations/0007_add_license_state.sql` using `CREATE TABLE IF NOT EXISTS` so fresh and upgrade paths converge on the same schema.

The exact table is:

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Task 2 intentionally leaves the table empty during migration. A SQL migration must not invent an installation identity because the parent design explicitly requires `crypto.randomUUID()`.

No `0008` migration is allowed in Task 2.

## `schema_d1.sql` contract

`schema_d1.sql` must contain an equivalent `CREATE TABLE IF NOT EXISTS license_state` definition so direct/fresh schema consumers and migration-based deployments describe the same database contract.

Plan-specific package mutation must not modify any `license_state` field or default. The existing per-plan `subscription_plan` mutation remains unchanged in Task 2.

## Drizzle mapping

Add an exported singleton table mapping in `src/db/schema.ts`:

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
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});
```

The SQL migration remains the authority for `CHECK(id = 1)` because the current Drizzle schema style does not need to introduce a new check-helper abstraction solely for Task 2.

## License state service boundary

Create `src/server/services/license.service.ts` with a minimal interface that later V16 tasks can extend without changing Task 2 semantics.

Required public types/functions:

```ts
export interface LicenseStateRow {
  id: 1;
  installationId: string;
  signedToken: string | null;
  status: string;
  effectivePlan: string | null;
  lastCheckedAt: string | null;
  graceUntil: string | null;
  expiresAt: string | null;
  controlPlaneUrl: string;
  updatedAt: string;
}

export interface LicenseD1StatementLike {
  bind(...values: unknown[]): LicenseD1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success?: boolean }>;
}

export interface LicenseD1DatabaseLike {
  prepare(sql: string): LicenseD1StatementLike;
}

export async function readLicenseState(db: LicenseD1DatabaseLike): Promise<LicenseStateRow | null>;

export async function ensureLicenseState(
  db: LicenseD1DatabaseLike,
  controlPlaneUrl: string,
): Promise<LicenseStateRow>;
```

`controlPlaneUrl` is an argument, not a hard-coded production URL. The parent design does not provide the final production Control Plane URL, so Task 2 must not invent one.

## `ensureLicenseState` behavior

`ensureLicenseState` must:

1. Reject an empty/whitespace-only `controlPlaneUrl` before writing.
2. Read singleton row `id = 1` first.
3. If the row already exists, return it unchanged. The caller's new URL must not overwrite existing identity/state in Task 2.
4. If no row exists, create a candidate `installationId` with `crypto.randomUUID()`.
5. Attempt an idempotent singleton insert using `INSERT OR IGNORE` with:
   - `id = 1`
   - generated `installation_id`
   - `status = 'unlicensed'`
   - caller-provided trimmed `control_plane_url`
   - `updated_at = CURRENT_TIMESTAMP`
6. Re-read `id = 1` and return the persisted row.
7. Throw a deterministic bootstrap error if the row is still missing after insert/re-read.

This pattern is required for bounded first-request races: concurrent callers may generate different candidate UUIDs, but the D1 singleton constraint plus `INSERT OR IGNORE` chooses one persisted row, and every caller returns the same stored identity after re-read.

Task 2 must not update `installation_id` on later calls.

## Row normalization

`readLicenseState` must map snake_case D1 columns into the `LicenseStateRow` camelCase shape. It must reject/throw on a structurally invalid stored singleton rather than silently generating a replacement identity.

At minimum the stored row must contain:

- `id === 1`
- non-empty `installation_id`
- non-empty `status`
- non-empty `control_plane_url`
- non-empty `updated_at`

Nullable token/plan/time fields remain nullable.

## Backup/Restore invariant

This is a security/compatibility derivation from the V14 and V16 parent designs:

- V14 application backup is an in-place business-data restore and excludes auth/integration/operational state.
- V16 `installation_id` is the identity to which a signed license token is bound.

Therefore `license_state` is installation/security metadata and must not be cloned or rewound by `.dormbackup`.

Task 2 must:

- add `license_state` to `BACKUP_EXCLUDED`
- include it in the exported manifest `excluded` list
- keep `license_state` absent from `BACKUP_TABLES` and backup payload schemas
- keep restore table allowlists/order unchanged so restore never deletes/inserts/updates `license_state`
- add a regression proving backup/restore code does not query or mutate `license_state`

Task 2 must not bump `.dormbackup` format version solely for this exclusion. The exported `excluded` array is metadata and the existing strict business-table allowlist already prevents `license_state` from entering restore data.

Note: current backup `schemaVersion` values are backup-format compatibility values and are not to be conflated with D1 migration file `0007`.

## Existing regression updates required by migration 0007

The Task 1 baseline contains tests that intentionally enforce a `0006` ceiling. Task 2 must update only those assertions whose purpose is to track the current maximum migration:

- `tests/package-release.test.mjs`
- `tests/package-parity.test.mjs`
- `tests/task5-login-app-shell-branding.test.mjs`
- `tests/task6-bill-branding.test.mjs`
- `tests/task7-tenant-portal-branding.test.mjs`

The new expected ceiling is exactly `0007_add_license_state.sql`.

The branding tests must continue to verify branding behavior; only their migration-ceiling expectation changes.

## Expected implementation files

From the reconstructed Task 1 Master:

- Create: `d1-migrations/0007_add_license_state.sql`
- Modify: `schema_d1.sql`
- Modify: `src/db/schema.ts`
- Create: `src/server/services/license.service.ts`
- Modify: `src/server/services/backup.service.ts`
- Create: `tests/license-state-migration.test.mjs`
- Create: `tests/license-state-service.test.ts`
- Modify: `tests/backup-export.test.ts`
- Add or modify a focused backup/restore regression to prove `license_state` is never restored
- Modify the five migration-ceiling tests listed above
- Modify Master-only builder/audit lists if new Task 2 test files would otherwise leak into customer ZIP

Branch-side lineage files may additionally include:

- `v16-task2-patches/**`
- `.github/workflows/v16-task2-license-state-gate.yml`
- `v16-task2-evidence/**`

## TDD acceptance tests

### Migration RED → GREEN

Tests must initially fail against pristine Task 1 because `0007_add_license_state.sql` does not exist.

After implementation they must verify:

- migration filename is exact
- migration creates `license_state`
- exact singleton primary-key/check contract exists
- exact columns/nullability/default intent is represented
- `schema_d1.sql` contains the same table contract
- `src/db/schema.ts` exports `licenseState`
- no migration after `0007` exists

### Fresh D1 migration path

In CI with Wrangler/D1 available:

- apply migrations from `0000` through `0007` to a fresh temporary D1 database
- verify `PRAGMA table_info(license_state)`/schema contains required columns
- verify table starts empty
- verify existing V15 business tables remain present

### Upgrade D1 migration path

In CI:

- construct/apply a database through `0006`
- seed representative V15 settings/business data
- apply `0007`
- verify seeded business/settings data is unchanged
- verify `license_state` exists and starts empty

### Bootstrap service RED → GREEN

Tests must prove:

- first call creates a persisted UUID using the runtime `crypto.randomUUID()` path
- first row has `id=1`, `status='unlicensed'`, null token/plan/time fields, supplied URL, and timestamp
- second call returns the original installation ID
- second call with a different URL does not rotate identity or silently overwrite state
- whitespace-only URL is rejected before insert
- malformed existing singleton is rejected rather than replaced
- simulated concurrent first calls converge on one persisted installation ID

### Backup/Restore regression

Tests must prove:

- backup manifest explicitly lists `license_state` as excluded
- backup data has no `license_state` property/table
- backup service does not SELECT from `license_state`
- restore service does not DELETE/INSERT/UPDATE `license_state`
- existing V14/V15 backup/restore tests remain green

### Package parity

Generated Demo/Basic/Standard/Pro PREVIEW packages must:

- all contain `d1-migrations/0007_add_license_state.sql`
- contain byte-identical `0007` migration content
- contain the same `license.service.ts` implementation
- preserve Task 1 `requiresLicense` values
- preserve `control-plane/` exclusion and signing-private-key leak gate
- have no migration after `0007`

## CI gate

The Task 2 workflow must reconstruct the candidate from immutable Task 1 artifact `9345425396`.

Required sequence:

1. Checkout Task 2 lineage branch only for versioned patches/workflow/spec/evidence.
2. Verify Task 2 patch bytes.
3. Download Task 1 artifact `9345425396`.
4. Verify outer artifact SHA-256 `56f5be6a25f0d831d3ac611d4cce531213a6704da772ad28ee3bccc0a7654001`.
5. Verify/extract Task 1 Master SHA-256 `6551a8778f39e5f1a3dd7c2cbc18655a316c29906d02d0df428dd00d6ac522eb`.
6. Verify pre-patch migration ceiling `0006_add_white_label_settings.sql`.
7. Apply Task 2 tests and prove the intended RED state.
8. Apply Task 2 implementation and prove focused GREEN.
9. Verify post-patch migration ceiling exactly `0007_add_license_state.sql`.
10. Run fresh and upgrade D1 migration smoke tests.
11. Run `npm ci`.
12. Run full `npm test`.
13. Run TypeScript lint.
14. Run Cloudflare types.
15. Run Pages production build.
16. Run VPS production build.
17. Generate PREVIEW packages only.
18. Audit all four PREVIEW packages for migration parity and Task 1 security boundaries.
19. Create/upload V16 Task 2 REVIEW artifact with exact hashes/evidence.
20. Persist `customer_ready=false`.

Task 2 workflow must not invoke a V16 CUSTOMER-READY release path.

## Security and compatibility invariants

- `license_state` is separate from `settings`.
- Task 2 does not make `license_state` an authority for feature access yet.
- `settings.subscription_plan` behavior remains unchanged in Task 2.
- Demo remains usable exactly as before Task 2.
- Basic/Standard/Pro are not made read-only by Task 2.
- No license key is accepted or stored in Task 2.
- No signing/verification key is added in Task 2.
- `signed_token` column exists but remains unused/null until later tasks.
- Control Plane source is still absent; Task 1 vendor boundary remains enforced.
- Backup remains usable and cannot clone/replay `installation_id` or cached license token.
- Existing V14 Backup/Restore and V15 White-label behavior must remain unchanged.

## Explicit non-goals

Task 2 does not:

- implement Control Plane `licenses`, `activations`, or `license_events`
- implement Ed25519 signing or verification
- embed an Ed25519 public key
- implement `/v1/licenses/*`
- implement `/api/license/*`
- store plaintext license keys
- populate `signed_token`
- implement `resolveLicenseState`, `resolveEffectivePlan`, or mutation gates used by production requests
- change `PLAN_ENTITLEMENTS`
- change `settings.subscription_plan` write authority
- calculate grace periods
- implement expired/revoked/suspended/read-only behavior
- create License Settings UI
- perform dependency vulnerability hardening

## Exit condition

Task 2 is complete in REVIEW status when:

- immutable Task 1 Master is reconstructed exactly
- migration `0007_add_license_state.sql` is the sole new migration and passes fresh/upgrade D1 smoke tests
- `license_state` schema matches the parent design
- bootstrap creates one stable persisted UUID with `crypto.randomUUID()` and survives concurrent first calls without identity rotation
- backup/restore explicitly excludes `license_state`
- all existing regressions, lint/types/builds, package generation, integrity, and parity gates pass
- Demo/Basic/Standard/Pro contain byte-identical `0007` and no later migration
- REVIEW artifact/evidence is reproducible and records `customer_ready=false`

Task 2 output must not be labeled V16 CUSTOMER-READY.