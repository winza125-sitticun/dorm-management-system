# V15 Task 2 Logo Asset Contract + Public Branding API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated White-label logo persistence and a safe unauthenticated branding API to the verified V15 Task 1 candidate without changing D1 schemaVersion, backup portability, plan entitlements, or package-generation invariants.

**Architecture:** Use the immutable V15 Task 1 candidate from source/release run `31996317195` as application source-of-truth, not repository `main`. Add a pure logo validator and a pure public-branding projection service, then wire them into Cloudflare Pages Functions and Express/VPS with matching authorization and response semantics. Store canonical Data URI content in the existing `settings.brand_logo_key`, keep logos excluded from `.dormbackup`, and close only after full source/release gates plus real Pro and Demo D1 smoke.

**Tech Stack:** TypeScript, Express, Drizzle ORM, Cloudflare Pages Functions, Cloudflare D1, Zod, Node.js `node:test`, Vite, Wrangler, GitHub Actions.

## Global Constraints

- Source-of-truth: Task 1 artifact `9276947765`, run `31996317195`, digest `sha256:9343d09dd935f60e176d31fc6448b37b7e6b6de5f1d01fe410be50d5e8b76260`.
- Behavioral baseline: Task 1 real D1 smoke run `31999654570` must remain green.
- Do not use repository `main` as application source and do not independently patch Demo/Basic/Standard/Pro ZIPs.
- White-label matrix remains Demo=`false`, Basic=`true`, Standard=`true`, Pro=`true`; PromptPay matrix remains unchanged.
- Do not add a D1 migration and do not add `brand_logo_data_uri`; `settings.brand_logo_key` is the sole V15 Task 2 logo storage slot.
- Supported MIME types are exactly PNG/JPEG/WebP; SVG and all other formats are rejected.
- Decoded logo maximum is exactly `307,200` bytes; MIME and magic bytes must both match.
- Logo mutation requires authenticated owner/super_admin plus `whiteLabel=true`; staff/caretaker receive authorization 403, Demo owner/super_admin receives `403 PLAN_REQUIRED`.
- `GET /api/public/branding` is unauthenticated, installation-global, and explicit-allowlist only. Because it has no owner token, it reads the primary installation settings row deterministically: lowest `settings.id` (`ORDER BY id ASC LIMIT 1`).
- If stored branding data is malformed, public projection fails safe: invalid/missing `dormName` -> `หอพักของฉัน`; invalid color/contact/logo -> `null`; never serialize malformed raw values.
- Demo public branding keeps first-setup `dormName` but masks color/contact/logo and returns `whiteLabelEnabled=false`.
- Authenticated Settings may expose `brandLogoUrl`; no API may expose `brand_logo_key` or `brandLogoKey`.
- `.dormbackup` stays `formatVersion=1`, `schemaVersion=7`; logo stays non-portable and current logo is preserved by v6/v7 restore.
- Existing LINE/Google/subscription/backup/owner-scope/no-store invariants remain unchanged.
- No UI uploader, image processing, R2, PWA/favicons, bill rendering, logo backup portability, or unrelated dependency upgrades.
- Real smoke must use stable `https://<project>.pages.dev` URLs, not hash-prefixed preview URLs.

---

## File Map

Application source changes are made in an extracted Task 1 candidate workspace and transported to CI as byte-exact patches.

- Create `src/server/validators/logo.ts` — strict Data URI validation/canonicalization.
- Create `src/server/services/branding.service.ts` — explicit safe public projection and safe stored-logo projection.
- Modify `src/db/schema.ts` — map existing Task 1 White-label DB columns for Express/Drizzle; no SQL migration.
- Modify `src/server/services/planAccess.service.ts` — map logo mutation path to `whiteLabel`.
- Modify `functions/api/[[path]].ts` — Cloudflare logo PUT/DELETE, Settings logo projection, public branding.
- Modify `server.ts` — Express parity, dedicated bounded logo parser, logo/public routes.
- Create `tests/logo-validation.test.ts`.
- Create `tests/public-branding.test.ts`.
- Create `tests/logo-api-contract.test.ts`.
- Modify `tests/settings-white-label.test.ts` and `tests/plan-api-guards.test.ts`.
- Modify `tests/backup-export.test.ts`, `tests/backup-validation.test.ts`, `tests/backup-restore.test.ts`, `tests/backup-restore-api.test.ts`.
- Modify `tests/package-builder.test.mjs`, `tests/package-parity.test.mjs`, `tests/package-release.test.mjs`.
- Create `.github/scripts/v15_task2_d1_smoke.py`, `.github/scripts/v15_task2_demo_smoke.py`.
- Create `.github/workflows/v15-task2-tdd.yml`, `.github/workflows/v15-task2-production-gate.yml`, `.github/workflows/v15-task2-d1-smoke.yml`.
- Create `V15_TASK2_STATUS_TH.md` only after final PASS.

---

### Task 1: Strict Logo Data URI Validator

**Files:** Create `src/server/validators/logo.ts`; create `tests/logo-validation.test.ts`.

**Produces:**

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

- [ ] **Step 1: Write valid-format RED tests.** Use tiny PNG/JPEG/WebP signature fixtures and assert MIME, byte count, and canonical re-encoded Data URI.
- [ ] **Step 2: Write unsafe-input RED tests.** Cover missing/non-string, remote URL, SVG/GIF, malformed Data URI, extra parameters, invalid base64/padding/whitespace, zero bytes, MIME/magic mismatch, and 307,201 decoded bytes. Assert errors never contain a sentinel payload substring.
- [ ] **Step 3: Run RED:** `npx tsx --test tests/logo-validation.test.ts` -> FAIL because module does not exist.
- [ ] **Step 4: Implement minimal validator.** Parse only `data:(image/png|image/jpeg|image/webp);base64,<payload>`, strict base64 round-trip, decode before size check, verify PNG `89504E470D0A1A0A`, JPEG `FFD8FF`, WebP `RIFF....WEBP`, then canonical re-encode. Do not use Node-only `Buffer` and do not reuse the existing 5 MB upload validator.
- [ ] **Step 5: Run GREEN:** `npx tsx --test tests/logo-validation.test.ts && npm run lint`.
- [ ] **Step 6: Review/commit** byte-exact test + production patch.

---

### Task 2: Explicit Public Branding Projection

**Files:** Create `src/server/services/branding.service.ts`; create `tests/public-branding.test.ts`.

**Produces:**

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

- [ ] **Step 1: RED paid-plan tests.** Basic/Standard/Pro output valid dormName/color/contact/logo and enabled=true.
- [ ] **Step 2: RED Demo masking test.** Demo with stored custom values returns dormName only; color/contact/logo null; enabled=false.
- [ ] **Step 3: RED malformed-storage tests.** Invalid dorm name falls back to `หอพักของฉัน`; invalid color/contact/logo become null rather than leaking raw values.
- [ ] **Step 4: RED secret-leak test.** Feed an object carrying sentinel PromptPay, LINE, Google, OAuth, password, role, license and backup fields through an `as any` boundary; serialized result must contain neither names nor values.
- [ ] **Step 5: Run RED:** `npx tsx --test tests/public-branding.test.ts`.
- [ ] **Step 6: Implement.** Construct output from named safe values only. Reuse Task 1 White-label normalization under try/catch for safe dorm/color/contact projection and `safeStoredLogoDataUri()` for logo. Never spread the source row.
- [ ] **Step 7: Run GREEN:** `npx tsx --test tests/logo-validation.test.ts tests/public-branding.test.ts && npm run lint`.
- [ ] **Step 8: Review/commit.** Reject any “serialize then delete secrets” design.

---

### Task 3: Cloudflare Logo Mutation + Authenticated Settings Projection

**Files:** Modify `src/server/services/planAccess.service.ts`, `functions/api/[[path]].ts`, `tests/plan-api-guards.test.ts`, `tests/settings-white-label.test.ts`; create `tests/logo-api-contract.test.ts`.

**Contract:** `requiredPlanFeatureForApiRequest('/api/settings/logo', 'PUT'|'DELETE') === 'whiteLabel'`; PUT request is bounded to 430,080 raw bytes; success exposes `brandLogoUrl` only.

- [ ] **Step 1: RED plan/role tests.** Demo owner -> PLAN_REQUIRED; owner/super_admin paid plans allowed; staff under paid owner -> FORBIDDEN.
- [ ] **Step 2: RED source-contract tests.** Require dedicated `/api/settings/logo` PUT/DELETE, bounded JSON on PUT, owner/super_admin gate, owner-scoped SQL update/delete, no payload logging, and `GET /api/settings` logo projection through `safeStoredLogoDataUri()`.
- [ ] **Step 3: Run RED:** `npx tsx --test tests/logo-api-contract.test.ts tests/settings-white-label.test.ts tests/plan-api-guards.test.ts`.
- [ ] **Step 4: Implement mutation block before generic Settings.** Order: auth -> owner role -> DB -> whiteLabel plan -> bounded JSON/validation -> owner-scoped update. DELETE sets `brand_logo_key=NULL`. Generic Settings PUT still rejects logo fields.
- [ ] **Step 5: Replace Task 1 `brandLogoUrl:null` in authenticated Settings with safe stored-logo projection while retaining all existing LINE/Google redaction.
- [ ] **Step 6: Run GREEN/type gates:** `npx tsx --test tests/logo-validation.test.ts tests/logo-api-contract.test.ts tests/settings-white-label.test.ts tests/plan-api-guards.test.ts && npm run lint && npm run check:cloudflare-types:master`.
- [ ] **Step 7: Review/commit.** Every write/delete must contain effective owner `user_id` scope.

---

### Task 4: Cloudflare `GET /api/public/branding`

**Files:** Modify `functions/api/[[path]].ts`, `tests/public-branding.test.ts`, `tests/logo-api-contract.test.ts`.

- [ ] **Step 1: RED route tests.** Endpoint exists without `getAuthUser()`, queries exactly `dorm_name, brand_color, contact_phone, brand_logo_key, subscription_plan`, uses `ORDER BY id ASC LIMIT 1`, and never uses `SELECT *`.
- [ ] **Step 2: Run RED:** `npx tsx --test tests/public-branding.test.ts tests/logo-api-contract.test.ts`.
- [ ] **Step 3: Implement.** Query primary settings row, pass only five safe columns to `buildPublicBranding()`. If no row exists, return `{dormName:'หอพักของฉัน',brandColor:null,contactPhone:null,logoDataUri:null,whiteLabelEnabled:false}`.
- [ ] **Step 4: Run GREEN/lint:** `npx tsx --test tests/public-branding.test.ts tests/logo-api-contract.test.ts && npm run lint`.
- [ ] **Step 5: Review/commit** with sentinel leak inspection.

---

### Task 5: Express/Drizzle Parity Repair + Logo/Public Routes

**Files:** Modify `src/db/schema.ts`, `server.ts`, `tests/logo-api-contract.test.ts`, `tests/settings-white-label.test.ts`, `tests/public-branding.test.ts`.

**Drizzle mapping only — no new migration:** 

```ts
brandLogoKey: text('brand_logo_key'),
brandColor: text('brand_color'),
contactPhone: text('contact_phone'),
billFooter: text('bill_footer'),
```

- [ ] **Step 1: RED parity test.** The verified Task 1 candidate inspection showed Express/Drizzle lacks these mappings and Express Settings projection lags Cloudflare. Require all four mappings plus `brandColor`, `contactPhone`, `billFooter`, `brandLogoUrl`, `whiteLabelEnabled` in Express Settings response.
- [ ] **Step 2: RED Express route tests.** Require PUT/DELETE logo, GET public branding, owner/plan gates, and safe primary-row projection.
- [ ] **Step 3: Run RED:** `npx tsx --test tests/logo-api-contract.test.ts tests/settings-white-label.test.ts tests/public-branding.test.ts`.
- [ ] **Step 4: Add dedicated Express logo parser before global `express.json()`.** Parse only PUT `/api/settings/logo`, cap raw JSON at 430,080 bytes, return the same new-route error envelope for malformed/oversized JSON. Do not increase the global parser limit.
- [ ] **Step 5: Implement Settings parity and logo routes.** Use Drizzle owner-scoped selects/updates and the same logo validator. New logo endpoints use `{success:false,error:{code,message}}` for 400/401/403/500 so they match Pages.
- [ ] **Step 6: Implement public branding.** Drizzle select only safe columns, `orderBy(asc(settings.id)).limit(1)`, then `buildPublicBranding()`.
- [ ] **Step 7: Run GREEN/VPS gate:** `npx tsx --test tests/logo-validation.test.ts tests/public-branding.test.ts tests/logo-api-contract.test.ts tests/settings-white-label.test.ts && npm run lint && npm run build:vps`.
- [ ] **Step 8: Review/commit.** Confirm mapping parity only; no second logo column, no SQL migration, no fake persistence.

---

### Task 6: Backup/Restore Logo Non-Portability Regressions

**Files:** Modify `tests/backup-export.test.ts`, `tests/backup-validation.test.ts`, `tests/backup-restore.test.ts`, `tests/backup-restore-api.test.ts`.

- [ ] **Step 1: Add export exclusion assertions.** Seed a sentinel Data URI; archive JSON must contain neither sentinel nor `brandLogoKey`, `brand_logo_key`, `logoDataUri`, `brandLogoUrl`. Export remains schemaVersion 7.
- [ ] **Step 2: Add v7/v6 preservation assertions.** Current logo sentinel A must survive both restore versions while existing portable White-label/business behavior remains unchanged.
- [ ] **Step 3: Prove regression test sensitivity.** Run `npm run test:backup`. If new assertions are already green because Task 1 preservation is correct, temporarily mutate the isolated test workspace to remove logo preservation and prove the assertion goes RED, then restore the source before continuing.
- [ ] **Step 4: Apply only a minimal production correction if evidence identifies one.** Never bump schemaVersion and never add logo to safe backup settings.
- [ ] **Step 5: Run GREEN:** `npm run test:backup && npx tsx --test tests/logo-validation.test.ts tests/public-branding.test.ts tests/logo-api-contract.test.ts tests/settings-white-label.test.ts && npm run lint`.
- [ ] **Step 6: Review/commit** without weakening LINE/Google/subscription preservation.

---

### Task 7: One Master Package Parity

**Files:** Modify `tests/package-builder.test.mjs`, `tests/package-parity.test.mjs`, `tests/package-release.test.mjs`; never hand-edit generated ZIPs.

- [ ] **Step 1: RED package assertions.** Generated packages must contain `logo.ts`, `branding.service.ts`, public/logo routes, no `brand_logo_data_uri`, and no migration after `0006_add_white_label_settings.sql`; entitlement matrix remains Demo false / paid true.
- [ ] **Step 2: Run preview RED:** `npm run packages:generate && npm run test:builder`.
- [ ] **Step 3: Update builder/parity expectations only where required by the new master files.
- [ ] **Step 4: Run GREEN release gate:** `npm run packages:generate && npm run test:builder && npm run packages:release`.
- [ ] **Step 5: Review/commit.** Verify four ZIPs derive from one master and differ only through approved plan/config mutation.

---

### Task 8: Immutable Task 2 Source/Release Candidate

**Files:** Create `.github/workflows/v15-task2-production-gate.yml` plus byte-exact Task 2 test/production patch artifacts used by that workflow.

**Input:** Task 1 artifact `9276947765` / run `31996317195`.
**Output:** `v15-task2-candidate-pending-d1-smoke` containing master ZIP, four package ZIPs and SHA-256 manifest.

- [ ] **Step 1: Build fail-closed workflow:** checkout -> download exact Task 1 artifact -> verify hashes/digest -> extract clean master -> verify/apply Task 2 patches -> Node 22 -> `npm ci` -> focused tests -> full `npm test` -> lint -> Cloudflare types -> Pages build -> VPS build -> package preview/tests -> guarded package release -> SHA-256 -> upload pending-smoke artifact.
- [ ] **Step 2: Trigger and inspect every individual gate**, not only overall workflow conclusion.
- [ ] **Step 3: Record run/job/artifact IDs, digest and master/package hashes.** Do not mark Task 2 complete yet.

---

### Task 9: Real Pro + Demo D1 Smoke and Final Status

**Files:** Create `.github/scripts/v15_task2_d1_smoke.py`, `.github/scripts/v15_task2_demo_smoke.py`, `.github/workflows/v15-task2-d1-smoke.yml`; create `V15_TASK2_STATUS_TH.md` only after PASS.

- [ ] **Step 1: Pro smoke.** Apply migrations through 0006 and assert no Task 2 migration; setup/login; PUT valid PNG and verify canonical authenticated/public projections; repeat JPEG/WebP; reject SVG, malformed base64, MIME/magic mismatch and 307,201-byte logo with 400 VALIDATION_ERROR; seed PromptPay/LINE/Google sentinels and prove public response contains none; export v7 and prove logo absent; v7 restore preserves logo; v6 restore preserves logo; DELETE clears logo; switch to Demo and verify public dormName remains while custom branding is masked and PUT/DELETE return PLAN_REQUIRED.
- [ ] **Step 2: Demo smoke.** First setup dormName succeeds; unauthenticated public branding returns that name with custom fields null; PUT/DELETE logo return PLAN_REQUIRED; backup export remains allowed schemaVersion 7.
- [ ] **Step 3: Create fail-closed workflow.** Download only Task 2 candidate; create disposable Pro/Demo APAC D1 + Pages; set JWT; migrate/build/deploy; use stable project URLs; run smoke; always upload sanitized evidence and cleanup.
- [ ] **Step 4: Inspect evidence.** Require candidate SHA, `overallPass`, health, format validation matrix, secret-leak checks, v7/v6 preservation, Demo gates.
- [ ] **Step 5: Verify cleanup.** Pro Pages, Pro D1, Demo Pages, Demo D1 all exit 0 even after a failed attempt.
- [ ] **Step 6: Write final `V15_TASK2_STATUS_TH.md`.** Record source/release run+job, candidate artifact ID/digest, master/four package SHA-256, smoke run+job, evidence artifact ID/digest, Pro/Demo matrix, cleanup exits and non-blocking dependency warnings. Only then mark `PASS — Task 2 verified complete`. Do not merge `main` automatically.

---

## Final Verification Checklist

Before any completion claim, run and inspect fresh evidence for:

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

Then run the independent real Cloudflare Pro + Demo D1 smoke. Source/local gates alone are insufficient.

## Explicit Non-Goals

- UI logo uploader/branding controls
- image crop/resize/compression or pixel validation
- R2 or remote image fetching
- PWA/favicons
- bill/logo rendering
- logo portability in backup
- PromptPay entitlement changes
- package-plan restructuring
- unrelated dependency upgrades or `npm audit fix --force`
