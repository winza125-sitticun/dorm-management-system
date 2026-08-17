# V15 Task 2 Logo Asset Contract + Public Branding API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated White-label logo persistence and a safe unauthenticated branding API to the verified V15 Task 1 candidate without changing D1 schemaVersion, backup portability, plan entitlements, or package-generation invariants.

**Architecture:** Treat the verified V15 Task 1 candidate from source/release run `31996317195` as the immutable application baseline rather than repository `main`. Add one pure logo Data URI validator, one pure public-branding projection boundary, then wire those into Cloudflare Pages Functions and Express/VPS with identical authorization and response semantics. Store the canonical Data URI in the existing `settings.brand_logo_key` column, keep logo non-portable in `.dormbackup`, and prove the result with RED→GREEN tests, package parity, full release gates, and real Pro + Demo D1 smoke.

**Tech Stack:** TypeScript, Express, Drizzle ORM, Cloudflare Pages Functions, Cloudflare D1, Zod, Node.js `node:test`, Vite, Wrangler, GitHub Actions.

## Global Constraints

- Source-of-truth is V15 Task 1 candidate artifact `9276947765` from run `31996317195`, digest `sha256:9343d09dd935f60e176d31fc6448b37b7e6b6de5f1d01fe410be50d5e8b76260`.
- V15 Task 1 real D1 smoke run `31999654570` is the behavioral baseline and must remain green.
- Do not use repository `main` as application source and do not independently patch Demo/Basic/Standard/Pro ZIPs.
- White-label matrix remains Demo=`false`, Basic=`true`, Standard=`true`, Pro=`true`.
- PromptPay entitlement semantics remain unchanged.
- Do not add a new D1 migration and do not add `brand_logo_data_uri`; use existing `settings.brand_logo_key` as the V15 Task 2 storage slot.
- Stored logo value must be a validated canonical Data URI written through the logo API only.
- Supported MIME types are exactly `image/png`, `image/jpeg`, `image/webp`; SVG and all other formats are rejected.
- Decoded logo size maximum is exactly `307,200` bytes.
- MIME header and magic bytes must both match.
- Logo mutations are owner/super_admin only and additionally require `whiteLabel=true`; staff/caretaker return authorization 403, Demo owner/super_admin return `403 PLAN_REQUIRED`.
- `GET /api/public/branding` is unauthenticated and explicit-allowlist only.
- Demo public branding preserves first-setup `dormName` but returns `brandColor`, `contactPhone`, and `logoDataUri` as `null`, with `whiteLabelEnabled=false`.
- `GET /api/settings` may return `brandLogoUrl`; no API may expose `brand_logo_key` or `brandLogoKey`.
- `.dormbackup` remains `formatVersion=1`, `schemaVersion=7`; logo stays excluded/non-portable and v6/v7 restore preserves the current logo.
- LINE, Google OAuth, subscription, backup/restore, owner scoping, and `Cache-Control: no-store` invariants from Task 1 must remain intact.
- No UI uploader, crop/resize/compression, R2, favicon/PWA changes, bill rendering, or logo portability in Task 2.
- Real smoke must use stable `https://<project>.pages.dev` URLs, not Wrangler hash-prefixed preview URLs, because Task 1 diagnostics proved the preview hostname can fail TLS in GitHub Actions.

---

## File Map

The immutable Task 1 candidate is extracted into an isolated execution workspace. Production edits belong to that workspace and are transported into CI as byte-exact patches; the repository branch stores specs/plans, patch artifacts, smoke scripts, workflows, and status evidence.

Application source files expected to change:

- `src/server/validators/logo.ts` — pure strict Data URI validator and canonicalizer.
- `src/server/services/branding.service.ts` — safe stored-logo projection and explicit public-branding projection.
- `src/server/validators/index.ts` — export logo request/body constants/helpers only if route code needs shared imports.
- `src/db/schema.ts` — Drizzle mapping for Task 1 White-label columns, including `brandLogoKey`; this is schema mapping parity only, not a new D1 migration.
- `src/types.ts` — public branding response type if needed; retain `Settings.brandLogoUrl` and never add `brandLogoKey` to public Settings.
- `src/server/services/planAccess.service.ts` — map `/api/settings/logo` mutations to `whiteLabel` where shared plan guard semantics are appropriate.
- `functions/api/[[path]].ts` — Cloudflare logo PUT/DELETE, authenticated Settings logo projection, unauthenticated public branding endpoint, bounded JSON body.
- `server.ts` — Express/VPS parity: Task 1 White-label Drizzle projection repair, dedicated logo body parser, logo PUT/DELETE, public branding endpoint.
- `tests/logo-validation.test.ts` — pure validator tests.
- `tests/public-branding.test.ts` — projection, Demo masking, secret-leak regressions.
- `tests/logo-api-contract.test.ts` — route/authorization/response source contract and plan mapping tests.
- `tests/settings-white-label.test.ts` — authenticated settings logo projection and internal-key non-exposure.
- `tests/backup-export.test.ts`, `tests/backup-restore.test.ts`, `tests/backup-restore-api.test.ts` — schemaVersion 7 and logo non-portability/preservation regressions.
- `tests/package-parity.test.mjs`, `tests/package-builder.test.mjs`, `tests/package-release.test.mjs` — One Master generated-package parity.

Repository-side CI/evidence files expected to be created for Task 2:

- `.github/scripts/v15_task2_d1_smoke.py`
- `.github/scripts/v15_task2_demo_smoke.py`
- `.github/workflows/v15-task2-tdd.yml`
- `.github/workflows/v15-task2-production-gate.yml`
- `.github/workflows/v15-task2-d1-smoke.yml`
- `V15_TASK2_STATUS_TH.md`

---

### Task 1: Build a strict logo Data URI validator

**Files:**
- Create: `src/server/validators/logo.ts`
- Create/Test: `tests/logo-validation.test.ts`

**Interfaces:**
- Produces:

```ts
export const LOGO_MAX_DECODED_BYTES = 307_200;
export const LOGO_REQUEST_MAX_BYTES = 430_080;
export type SupportedLogoMime = 'image/png' | 'image/jpeg' | 'image/webp';
export interface ValidatedLogoData {
  mime: SupportedLogoMime;
  bytes: Uint8Array;
  sizeBytes: number;
  dataUri: string;
}
export function validateLogoDataUri(input: unknown): ValidatedLogoData;
export function safeStoredLogoDataUri(input: unknown): string | null;
```

- `validateLogoDataUri()` throws an `Error` with a short field-safe message; it must never include the full input/base64 payload.
- `safeStoredLogoDataUri()` returns canonical Data URI only when the stored value validates; otherwise `null`.

- [ ] **Step 1: Write RED tests for valid PNG/JPEG/WebP and canonicalization**

Use tiny byte fixtures with correct signatures and assert exact canonical MIME, byte count, and re-encoded Data URI.

```ts
const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
const jpeg = Uint8Array.from([0xff,0xd8,0xff,0xe0,0x00]);
const webp = new TextEncoder().encode('RIFF1234WEBP');
```

- [ ] **Step 2: Write RED tests for malformed/unsafe inputs**

Cover: missing/non-string, remote URL, SVG, GIF, invalid base64, whitespace inside base64, extra Data URI parameters, zero-byte payload, PNG/JPEG/WebP MIME mismatch, and `307_201` decoded bytes.

Also assert thrown messages do not contain a sentinel substring from the payload.

- [ ] **Step 3: Run RED**

Run:

```bash
npx tsx --test tests/logo-validation.test.ts
```

Expected: FAIL because `src/server/validators/logo.ts` does not exist.

- [ ] **Step 4: Implement the minimal validator**

Implementation rules:
- parse with an anchored pattern equivalent to `^data:(image/png|image/jpeg|image/webp);base64,([A-Za-z0-9+/]*={0,2})$`;
- reject whitespace before decode;
- enforce canonical base64 round-trip so permissive decoder behavior cannot accept malformed padding;
- decode before checking `sizeBytes`;
- check exact signatures from the approved spec;
- re-encode bytes and return canonical lowercase MIME Data URI.

Do not reuse `UploadValidationService.validateUpload()` because its limit is 5 MB and it does not validate magic bytes.

- [ ] **Step 5: Run GREEN and TypeScript gate**

```bash
npx tsx --test tests/logo-validation.test.ts
npm run lint
```

Expected: all validator tests PASS; lint exit 0.

- [ ] **Step 6: Review and commit**

Review for no Node-only `Buffer` dependency in the validator so the same source runs under Pages Functions. Commit the byte-exact test + implementation patch.

---

### Task 2: Add a pure explicit-allowlist public branding projection

**Files:**
- Create: `src/server/services/branding.service.ts`
- Create/Test: `tests/public-branding.test.ts`

**Interfaces:**

```ts
export interface BrandingSource {
  dormName?: unknown;
  brandColor?: unknown;
  contactPhone?: unknown;
  brandLogoValue?: unknown;
  subscriptionPlan?: unknown;
}

export interface PublicBranding {
  dormName: string;
  brandColor: string | null;
  contactPhone: string | null;
  logoDataUri: string | null;
  whiteLabelEnabled: boolean;
}

export function buildPublicBranding(source: BrandingSource): PublicBranding;
```

`buildPublicBranding()` consumes only the safe fields above, derives `whiteLabelEnabled` with existing plan helpers, and calls `safeStoredLogoDataUri()` for the logo.

- [ ] **Step 1: Write RED paid-plan projection tests**

Assert Basic/Standard/Pro preserve dorm name, normalized color/contact, valid logo, and `whiteLabelEnabled=true`.

- [ ] **Step 2: Write RED Demo masking test**

Provide Demo with non-null brand color/contact/logo and assert output keeps only `dormName`; custom branding values are `null` and enabled is false.

- [ ] **Step 3: Write RED secret-leak regression**

Pass an object with extra sentinel fields such as `promptpayId`, `lineChannelAccessToken`, `lineChannelSecret`, `googleSpreadsheetId`, `refreshToken`, `subscriptionLicenseKey`, then assert serialized output contains none of their names or values.

- [ ] **Step 4: Run RED**

```bash
npx tsx --test tests/public-branding.test.ts
```

- [ ] **Step 5: Implement the minimal projection**

Use object construction from named safe inputs only. Do not spread the source row.

- [ ] **Step 6: Run GREEN + lint**

```bash
npx tsx --test tests/logo-validation.test.ts tests/public-branding.test.ts
npm run lint
```

- [ ] **Step 7: Review and commit**

Reject any implementation that serializes a full settings row then deletes fields.

---

### Task 3: Wire Cloudflare plan guards, bounded logo requests, mutations, and Settings projection

**Files:**
- Modify: `src/server/services/planAccess.service.ts`
- Modify: `functions/api/[[path]].ts`
- Create/Test: `tests/logo-api-contract.test.ts`
- Modify/Test: `tests/settings-white-label.test.ts`

**Interfaces:**
- `requiredPlanFeatureForApiRequest('/api/settings/logo', 'PUT'|'DELETE') === 'whiteLabel'`.
- Cloudflare PUT body is bounded by `LOGO_REQUEST_MAX_BYTES = 430_080` before JSON parse.
- PUT response: `{ success: true, brandLogoUrl: canonicalDataUri }`.
- DELETE response: `{ success: true, brandLogoUrl: null }`.
- `GET /api/settings` returns `brandLogoUrl` from valid stored `brand_logo_key`, never internal key.

- [ ] **Step 1: Write RED plan/role contract tests**

Assert `/api/settings/logo` requires `whiteLabel`; Demo owner maps to PLAN_REQUIRED while staff role is still explicitly rejected as FORBIDDEN after authentication under an enabled owner plan.

- [ ] **Step 2: Write RED route-source contract tests**

Assert Cloudflare source has:
- path `/api/settings/logo` for PUT and DELETE;
- `readBoundedJson(...LOGO_REQUEST_MAX_BYTES...)` on PUT;
- role check restricted to owner/super_admin;
- `UPDATE settings SET brand_logo_key = ?` scoped by `user_id = ?`;
- delete uses `brand_logo_key = NULL` scoped by owner;
- no logging of `logoDataUri` payload;
- Settings GET projects `brandLogoUrl` through `safeStoredLogoDataUri` and does not include `brandLogoKey`.

- [ ] **Step 3: Run RED**

```bash
npx tsx --test tests/logo-api-contract.test.ts tests/settings-white-label.test.ts tests/plan-api-guards.test.ts
```

- [ ] **Step 4: Implement Cloudflare mutations**

Place the logo mutation block before the generic `/api/settings` block. Required order:
1. `getAuthUser()`;
2. reject unauthenticated 401;
3. reject non owner/super_admin with `FORBIDDEN`;
4. require DB;
5. resolve effective owner plan and require whiteLabel;
6. PUT: bounded JSON → require `logoDataUri` → validate → update owner row → return public field only;
7. DELETE: set NULL for owner row → return null.

Do not route logo writes through generic `PUT /api/settings`; `brandLogoKey`/`brandLogoUrl` remain read-only there.

- [ ] **Step 5: Update authenticated Settings logo projection**

Replace Task 1's `brandLogoUrl: null` with safe validated projection from `res.brand_logo_key`; preserve all existing redaction for LINE/Google fields.

- [ ] **Step 6: Run GREEN + Cloudflare TypeScript gate**

```bash
npx tsx --test tests/logo-validation.test.ts tests/logo-api-contract.test.ts tests/settings-white-label.test.ts tests/plan-api-guards.test.ts
npm run lint
npm run check:cloudflare-types:master
```

- [ ] **Step 7: Review and commit**

Verify every logo UPDATE/DELETE includes effective `user_id` owner scope and no response/log exposes the internal key name.

---

### Task 4: Add unauthenticated Cloudflare `GET /api/public/branding`

**Files:**
- Modify: `functions/api/[[path]].ts`
- Modify/Test: `tests/public-branding.test.ts`
- Modify/Test: `tests/logo-api-contract.test.ts`

**Interfaces:**
- `GET /api/public/branding` does not call `getAuthUser()`.
- D1 query selects only: `dorm_name`, `brand_color`, `contact_phone`, `brand_logo_key`, `subscription_plan`.
- Response is `buildPublicBranding(...)` only.

- [ ] **Step 1: Add RED public-route source assertions**

Assert the route exists before authenticated Settings routing, uses a five-column explicit SELECT rather than `SELECT *`, and response shape excludes `billFooter`, PromptPay, LINE, Google, subscription status/expiry, and internal key field.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test tests/public-branding.test.ts tests/logo-api-contract.test.ts
```

- [ ] **Step 3: Implement the Cloudflare public endpoint**

If no settings row exists, return default branding:

```json
{
  "dormName": "หอพักของฉัน",
  "brandColor": null,
  "contactPhone": null,
  "logoDataUri": null,
  "whiteLabelEnabled": false
}
```

Do not require JWT_SECRET/auth for this read path beyond normal application startup configuration.

- [ ] **Step 4: Run GREEN + lint**

```bash
npx tsx --test tests/public-branding.test.ts tests/logo-api-contract.test.ts
npm run lint
```

- [ ] **Step 5: Review and commit**

Review serialized fixtures with sentinel secrets and verify none can enter the response through object spread.

---

### Task 5: Repair Express/Drizzle White-label parity and add equivalent logo/public routes

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `server.ts`
- Modify/Test: `tests/logo-api-contract.test.ts`
- Modify/Test: `tests/settings-white-label.test.ts`

**Interfaces:**
- Drizzle `settings` mapping gains existing DB columns only:

```ts
brandLogoKey: text('brand_logo_key'),
brandColor: text('brand_color'),
contactPhone: text('contact_phone'),
billFooter: text('bill_footer'),
```

- No SQL migration file is created.
- Express uses the same validator/projection helpers as Cloudflare.

- [ ] **Step 1: Write RED parity assertions**

The exact Task 1 candidate inspection showed Express/Drizzle does not yet map the new White-label columns and Express Settings projection is behind Cloudflare. Add tests that require the four Drizzle mappings, `brandLogoUrl`, `brandColor`, `contactPhone`, `billFooter`, and `whiteLabelEnabled` in Express GET Settings.

- [ ] **Step 2: Add RED Express route assertions**

Require PUT/DELETE `/api/settings/logo`, GET `/api/public/branding`, owner/super_admin gate, whiteLabel plan gate, and explicit-safe public selection.

- [ ] **Step 3: Run RED**

```bash
npx tsx --test tests/logo-api-contract.test.ts tests/settings-white-label.test.ts tests/public-branding.test.ts
```

- [ ] **Step 4: Add a dedicated Express logo JSON parser before global `express.json()`**

The default Express JSON parser limit is too small for a 300 KiB decoded image encoded as base64. Mount a parser only for PUT `/api/settings/logo` with maximum raw JSON bytes `430_080`; return existing-style error envelope on malformed or oversized JSON. Do not raise the global API body limit.

- [ ] **Step 5: Implement Express Settings parity and logo mutations**

Use Drizzle owner-scoped selects/updates. Generic `/api/settings` must still reject `brandLogoKey`/`brandLogoUrl`; dedicated logo route owns writes.

- [ ] **Step 6: Implement Express public branding**

Use a Drizzle select projection listing only safe fields, then `buildPublicBranding()`.

- [ ] **Step 7: Run GREEN + VPS build gate**

```bash
npx tsx --test tests/logo-validation.test.ts tests/public-branding.test.ts tests/logo-api-contract.test.ts tests/settings-white-label.test.ts
npm run lint
npm run build:vps
```

- [ ] **Step 8: Review and commit**

Confirm this is mapping/runtime parity only: no new D1 migration, no second logo storage field, no fake persistence.

---

### Task 6: Lock backup/restore non-portability and preservation regressions

**Files:**
- Modify/Test: `tests/backup-export.test.ts`
- Modify/Test: `tests/backup-validation.test.ts`
- Modify/Test: `tests/backup-restore.test.ts`
- Modify/Test: `tests/backup-restore-api.test.ts`

**Interfaces:**
- New export remains schemaVersion 7.
- Exported settings never contain `brandLogoKey`, `brand_logo_key`, `logoDataUri`, or `brandLogoUrl`.
- v7 restore preserves current `brand_logo_key` while restoring portable White-label fields.
- v6 restore also preserves current `brand_logo_key`.

- [ ] **Step 1: Add failing export exclusion tests**

Seed a sentinel Data URI in the source settings row and assert no archive JSON contains the sentinel or any logo field names.

- [ ] **Step 2: Add failing restore-preservation tests**

Set current logo sentinel A, restore v7/v6 payloads, assert current logo remains A while business/portable settings behave as Task 1 already specifies.

- [ ] **Step 3: Run RED if current coverage is insufficient**

```bash
npm run test:backup
```

If existing Task 1 behavior already makes a new assertion GREEN immediately, temporarily mutate the tested preservation branch in the isolated workspace to prove the regression test turns RED, then restore implementation before continuing.

- [ ] **Step 4: Make only the minimal production fix required**

Do not bump schemaVersion and do not add logo to `BackupSafeSettingsV1`.

- [ ] **Step 5: Run GREEN + full focused regression**

```bash
npm run test:backup
npx tsx --test tests/logo-validation.test.ts tests/public-branding.test.ts tests/logo-api-contract.test.ts tests/settings-white-label.test.ts
npm run lint
```

- [ ] **Step 6: Review and commit**

Check that integration/subscription preservation logic was not broadened or weakened.

---

### Task 7: Prove One Master package parity and package safety

**Files:**
- Modify/Test: `tests/package-builder.test.mjs`
- Modify/Test: `tests/package-parity.test.mjs`
- Modify/Test: `tests/package-release.test.mjs`
- Do not independently modify generated ZIPs.

**Interfaces:**
- Demo generated package contains logo/public API code but runtime entitlement blocks mutations.
- Basic/Standard/Pro generated packages contain identical validator/API implementation with plan data controlling access.
- No package contains a second logo column/migration.

- [ ] **Step 1: Add RED package assertions**

Generated package checks must verify:
- `src/server/validators/logo.ts` exists;
- `src/server/services/branding.service.ts` exists;
- Pages Functions contains `/api/public/branding` and `/api/settings/logo`;
- `d1-migrations` still ends at `0006_add_white_label_settings.sql`;
- source does not contain `brand_logo_data_uri`;
- entitlement matrix remains Demo false / paid plans true.

- [ ] **Step 2: Run preview generation and package tests**

```bash
npm run packages:generate
npm run test:builder
```

Expected before builder/parity updates: at least one new assertion RED.

- [ ] **Step 3: Update only builder/parity logic needed for the new master files**

Never hand-edit generated package ZIP contents.

- [ ] **Step 4: Run GREEN package gate**

```bash
npm run packages:generate
npm run test:builder
npm run packages:release
```

- [ ] **Step 5: Review and commit**

Inspect all four package hashes and confirm differences are plan/config metadata, not independent logo feature patches.

---

### Task 8: Assemble immutable V15 Task 2 candidate and run the full source/release gate

**Files:**
- Create: `.github/workflows/v15-task2-production-gate.yml`
- Create/update: byte-exact Task 2 test/production patch artifacts used by the workflow.

**Interfaces:**
- Input is immutable Task 1 candidate artifact `9276947765` from run `31996317195`.
- Output artifact name: `v15-task2-candidate-pending-d1-smoke`.
- Candidate must include master ZIP, four generated plan ZIPs, and SHA-256 manifest.

- [ ] **Step 1: Write the fail-closed workflow**

Workflow sequence:
1. checkout Task 2 execution branch;
2. download exact Task 1 candidate artifact by run ID + artifact name;
3. verify artifact digest/Task 1 SHA files;
4. extract master into clean workspace;
5. apply Task 2 byte-exact patches with SHA-256 verification;
6. Node 22;
7. `npm ci`;
8. focused Task 2 tests;
9. full `npm test`;
10. `npm run lint`;
11. `npm run check:cloudflare-types:master`;
12. `npm run build:pages`;
13. `npm run build:vps`;
14. `npm run packages:generate` + builder tests;
15. guarded `npm run packages:release`;
16. compute master + four package SHA-256;
17. upload candidate artifact marked pending D1 smoke.

- [ ] **Step 2: Trigger gate and inspect every step**

Do not accept only overall workflow status; verify test/lint/types/build/package steps individually.

- [ ] **Step 3: Record candidate IDs and hashes**

Candidate is not CUSTOMER-READY and Task 2 is not complete at this point.

---

### Task 9: Run real Pro + Demo Cloudflare D1 smoke and close Task 2 only with evidence

**Files:**
- Create: `.github/scripts/v15_task2_d1_smoke.py`
- Create: `.github/scripts/v15_task2_demo_smoke.py`
- Create: `.github/workflows/v15-task2-d1-smoke.yml`
- Create after PASS: `V15_TASK2_STATUS_TH.md`

**Interfaces:**
- Smoke downloads only the immutable Task 2 candidate from Task 8.
- Creates disposable Pro and Demo D1 + Pages projects in APAC.
- Uses stable project URLs `https://<project>.pages.dev` for health and API tests.
- Cleanup always runs and must exit 0 for all created Pages/D1 resources.

- [ ] **Step 1: Write Pro smoke assertions**

The Pro smoke must:
1. apply migrations through `0006_add_white_label_settings.sql` and prove no Task 2 migration exists;
2. first setup/login;
3. PUT a valid PNG logo and verify canonical `brandLogoUrl`;
4. GET authenticated Settings and verify logo plus White-label fields, with no internal key;
5. GET public branding unauthenticated and verify safe allowlisted fields only;
6. repeat valid logo PUT for JPEG and WebP;
7. reject SVG, invalid base64, MIME/magic mismatch, and decoded 307,201-byte payload with `400 VALIDATION_ERROR`;
8. seed sentinel PromptPay/LINE/Google values and prove public response does not contain them;
9. export schema v7 backup and prove logo data/internal key absent;
10. mutate business + portable White-label state, restore v7, prove logo preserved and logical backup hash behavior from Task 1 remains correct;
11. restore v6 and prove logo preserved;
12. DELETE logo and verify authenticated/public projections become null;
13. switch owner plan to demo and verify public dormName remains while custom branding is masked and PUT/DELETE logo return `403 PLAN_REQUIRED`.

- [ ] **Step 2: Write Demo smoke assertions**

The Demo smoke must:
1. first setup with custom dormName succeeds;
2. public branding works without auth and returns that dormName;
3. brandColor/contact/logo are null and enabled false;
4. PUT logo returns 403 PLAN_REQUIRED;
5. DELETE logo returns 403 PLAN_REQUIRED;
6. backup export remains allowed and schemaVersion 7.

- [ ] **Step 3: Create fail-closed smoke workflow**

Reuse Task 1 proven resource lifecycle: candidate hash verification, temp D1/Pages create, JWT secrets, migrations, build/deploy, stable Pages URL, smoke, sanitized evidence upload, `if: always()` cleanup.

- [ ] **Step 4: Run smoke and inspect sanitized evidence**

Required final evidence fields include candidate SHA, `overallPass`, health, logo validation matrix, public secret-leak checks, v7/v6 preservation, Demo gates, and cleanup result.

- [ ] **Step 5: Verify cleanup logs**

All created Pro/Demo Pages projects and D1 databases must report cleanup exit `0` even after failures.

- [ ] **Step 6: Write final Task 2 status only after fresh verification**

`V15_TASK2_STATUS_TH.md` must record:
- source/release run + job;
- candidate artifact ID/digest;
- master and four package SHA-256;
- D1 smoke run + job;
- evidence artifact ID/digest;
- Pro/Demo result matrix;
- cleanup exits;
- any non-blocking dependency warnings.

Only then mark **PASS — Task 2 verified complete**. Do not merge to `main` automatically.

---

## Final Verification Checklist

Before claiming Task 2 complete, verify all items with fresh evidence:

```bash
npx tsx --test tests/logo-validation.test.ts tests/public-branding.test.ts tests/logo-api-contract.test.ts tests/settings-white-label.test.ts
npm run test:backup
npm test
npm run lint
npm run check:cloudflare-types:master
npm run build:pages
npm run build:vps
npm run packages:generate
npm run test:builder
npm run packages:release
```

Then verify real Cloudflare smoke separately. Passing local/source gates without D1 smoke is not sufficient.

## Explicit Non-Goals

Do not implement any of these while executing this plan:
- UI logo uploader or branding controls;
- image resizing/cropping/compression;
- pixel dimension validation;
- R2 storage;
- remote image fetching;
- PWA/favicons;
- bill/logo rendering;
- backup logo portability;
- PromptPay entitlement changes;
- package-plan restructuring;
- unrelated dependency upgrades or `npm audit fix --force`.
