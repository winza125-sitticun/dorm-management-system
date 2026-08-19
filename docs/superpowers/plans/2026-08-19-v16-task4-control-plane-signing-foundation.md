# V16 Task 4 — Control Plane Signing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the vendor-only Control Plane D1 schema, Ed25519 signer, 404 Worker shell, and strict customer-package immutability gate without changing customer runtime bytes.

**Architecture:** Reconstruct from immutable Task 3 REVIEW Master `c4f6eeed671b96e99f54fcd71504e16ad1b268014636f2d5f57eb4289f3e51c7`. Keep all new production code under `control-plane/`; the existing customer app remains unchanged. Prove the vendor signer is protocol-compatible with Task 3 by signing with an ephemeral private key and verifying with the shipped customer verifier.

**Tech Stack:** Node 22, TypeScript 5.8, `tsx`, Cloudflare Workers Web Crypto, Wrangler 4/D1, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-19-v16-task4-control-plane-signing-foundation-design.md`

## Global Constraints

- Baseline artifact ID: `9348923137`; artifact SHA-256: `98382e591e5c9c5027026011ccac6d66702ed18c576603060e7860d66313c682`.
- Baseline Master SHA-256: `c4f6eeed671b96e99f54fcd71504e16ad1b268014636f2d5f57eb4289f3e51c7`.
- Customer migration ceiling remains exactly `0007_add_license_state.sql`; no customer `0008`.
- Customer packages remain exactly 206 entries and retain Task 3 normalized path+content manifests.
- Customer verifier SHA remains `2b2a0144ba6b01ed9f9bfbf16d7df1d4a7ed2fcc5655e6c2c2fb43d53ff76180`.
- `control-plane/` is Master/vendor-only and never ships in Demo/Basic/Standard/Pro.
- No committed production database ID, private key, private seed, private JWK, PEM private key, or PKCS#8 fixture.
- `LICENSE_SIGNING_PRIVATE_KEY` may appear only in vendor source/spec/config; never in customer ZIPs.
- `/v1/licenses/*` remains 404 in Task 4.
- `customer_ready=false`; Task 4 output is REVIEW only.

---

### Task 1: Make the existing control-plane exclusion regression non-destructive

**Files:**
- Modify: `tests/package-builder.test.mjs`

**Interfaces:**
- Consumes: existing `buildPackageTree()` behavior and `MASTER_PREFIXES` exclusion of `control-plane/`.
- Produces: a regression that can run safely both before and after a real `control-plane/` directory exists.

- [ ] **Step 1: Change the test first so it records whether `control-plane/` existed, writes one unique marker, and in cleanup deletes only the marker plus a directory created by the test when empty.**

Use `existsSync(vendorRoot)` before `mkdir`, keep `createdVendorRoot`, and replace recursive cleanup of `vendorRoot` with `rm(markerFile, { force: true })`; only call `rmdir(vendorRoot)` when `createdVendorRoot` is true.

- [ ] **Step 2: Prove the regression would protect a real vendor directory.**

Run a focused test with a pre-created sentinel file under `control-plane/`, execute the package-builder test, and assert the sentinel still exists afterwards.

- [ ] **Step 3: Run the normal builder test file.**

Run: `node --test tests/package-builder.test.mjs`
Expected: all tests pass and no real-root directory is recursively removed.

- [ ] **Step 4: Commit the safe regression change in the local implementation history.**

---

### Task 2: Add Control Plane D1 schema under a separate migration root

**Files:**
- Create: `control-plane/migrations/0001_license_schema.sql`
- Create: `control-plane/tests/schema.test.ts`

**Interfaces:**
- Produces: vendor tables `licenses`, `activations`, `license_events` and index `idx_activations_license_revoked`.
- Does not modify: `d1-migrations/**`, customer Drizzle schema, `license_state`.

- [ ] **Step 1: Write schema tests before the migration exists.**

Tests must inspect/apply `control-plane/migrations/0001_license_schema.sql` against an empty SQLite-compatible D1 smoke database and assert exact tables/columns/defaults/constraints/indexes, zero initial rows, duplicate `key_hash` rejection, unsupported plan/status rejection, `max_activations=0` rejection, default `max_activations=1`, and duplicate `(license_id, installation_id)` rejection.

- [ ] **Step 2: Run the schema test and confirm RED because the migration file is missing.**

Run: `npx tsx --test control-plane/tests/schema.test.ts`
Expected: FAIL due to missing `0001_license_schema.sql`.

- [ ] **Step 3: Add the exact SQL from the approved spec.**

Create only the three tables and `idx_activations_license_revoked`; do not seed data and do not add customer migration files.

- [ ] **Step 4: Run schema tests and a Wrangler local D1 migration smoke.**

Expected: schema tests pass; Wrangler reports successful local application of `0001_license_schema.sql` with all application tables empty.

- [ ] **Step 5: Verify customer migration ceiling remains `0007_add_license_state.sql`.**

Run: `find d1-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort -V | tail -1`
Expected: `0007_add_license_state.sql`.

---

### Task 3: Add Ed25519 signing module and cross-contract verification

**Files:**
- Create: `control-plane/src/signing.ts`
- Create: `control-plane/tests/signing.test.ts`
- Create: `control-plane/tests/customer-contract.test.ts`
- Read-only contract dependency: `src/server/services/licenseToken.service.ts`

**Interfaces:**
- Produces:
  - `canonicalizeLicenseTokenPayload(payload): string`
  - `importLicenseSigningPrivateKey(pkcs8Base64Url): Promise<CryptoKey>`
  - `signLicenseToken(payload, privateKey): Promise<string>`
  - `LicenseSigningError` with codes `LICENSE_SIGNING_PAYLOAD_INVALID` and `LICENSE_SIGNING_PRIVATE_KEY_INVALID`
- Consumes: Task 3 `importLicensePublicKey()` and `verifyLicenseToken()` only in tests.

- [ ] **Step 1: Write signing/cross-contract tests before production signer code.**

Cover exact canonical key order, deterministic canonical bytes, valid runtime-generated PKCS#8 import, malformed base64url, invalid PKCS#8, Basic/Standard/Pro signing, invalid version/IDs/plan/status/timestamps, key mismatch, payload tamper, signature tamper, and exact verification through Task 3 customer verifier.

- [ ] **Step 2: Run focused signing tests and confirm RED because `control-plane/src/signing.ts` does not exist.**

Run: `npx tsx --test control-plane/tests/signing.test.ts control-plane/tests/customer-contract.test.ts`
Expected: module-not-found RED.

- [ ] **Step 3: Implement strict base64url decode/encode, payload validation, canonical serialization, PKCS#8 import, and Ed25519 signing.**

Signature input is UTF-8 canonical JSON bytes. Output is exactly `dormlic1.<payload-base64url>.<signature-base64url>`. Error messages expose only deterministic error codes.

- [ ] **Step 4: Run focused tests and confirm GREEN.**

Expected: all signing and cross-contract tests pass with ephemeral runtime keys only.

- [ ] **Step 5: Verify no private key fixture exists.**

Search the product tree for PEM private-key headers, private JWK fields, PKCS#8 fixture blobs, and deterministic seed material; vendor code may contain only the identifier `LICENSE_SIGNING_PRIVATE_KEY`.

---

### Task 4: Add the standalone Worker shell and vendor package configuration

**Files:**
- Create: `control-plane/src/index.ts`
- Create: `control-plane/tests/worker.test.ts`
- Create: `control-plane/package.json`
- Create: `control-plane/package-lock.json`
- Create: `control-plane/tsconfig.json`
- Create: `control-plane/wrangler.template.jsonc`

**Interfaces:**
- Produces `Env { LICENSE_DB: D1Database; LICENSE_SIGNING_PRIVATE_KEY: string }` and a default Worker fetch handler.
- Every `/v1/licenses/*` request returns 404; no Task 5 service exists or is invoked.

- [ ] **Step 1: Write Worker-shell tests before `src/index.ts` exists.**

Test `/v1/licenses/activate`, `/refresh`, and `/deactivate`; each must return 404 and response generation must not require D1 or signing-secret access.

- [ ] **Step 2: Run Worker-shell tests and confirm RED due to missing module.**

Run: `npx tsx --test control-plane/tests/worker.test.ts`
Expected: module-not-found RED.

- [ ] **Step 3: Implement the minimal Worker shell.**

Return `new Response('Not Found', { status: 404 })` for all requests. Export the approved `Env` type; do not import `signing.ts` into a live route.

- [ ] **Step 4: Add standalone package and TypeScript config.**

`package.json` uses Node 22 compatible devDependencies only: `typescript`, `tsx`, `wrangler`, and `@cloudflare/workers-types`; scripts include `test`, `typecheck`, and a local D1 migration-smoke command. Generate and commit `package-lock.json` with `npm install --package-lock-only --ignore-scripts` inside `control-plane/`.

- [ ] **Step 5: Add `wrangler.template.jsonc`.**

Use `main: "src/index.ts"`, D1 binding `LICENSE_DB`, database name `dorm-license-control-plane-placeholder`, all-zero placeholder UUID, and `migrations_dir: "migrations"`. No `vars` entry may contain `LICENSE_SIGNING_PRIVATE_KEY`.

- [ ] **Step 6: Install from lock and run vendor package checks.**

Run inside `control-plane/`: `npm ci`, `npm test`, `npm run typecheck`, then local D1 migration smoke.
Expected: all pass.

---

### Task 5: Lock customer-package immutability and build the Task 4 REVIEW gate

**Files:**
- Modify: `tests/package-builder.test.mjs` only for safe regression already covered above.
- Modify: `tests/package-audit.test.mjs` only if a new RED test is required for a missing private-material boundary.
- Create lineage files under `v16-task4-patches/**`.
- Create: `.github/workflows/v16-task4-control-plane-signing-gate.yml`
- Create evidence under `v16-task4-evidence/**` via CI.

**Interfaces:**
- Consumes immutable Task 3 artifact `9348923137` and exact Task 3 customer PREVIEW ZIPs.
- Produces a V16 Task 4 REVIEW artifact with `customer_ready=false`.

- [ ] **Step 1: Add RED package-immutability tests.**

Generate Task 4 PREVIEW packages and assert for each plan: exactly 206 entries, latest customer migration exactly `0007_add_license_state.sql`, verifier SHA exactly `2b2a0144ba6b01ed9f9bfbf16d7df1d4a7ed2fcc5655e6c2c2fb43d53ff76180`, no `control-plane/`, no Control Plane tests, no `LICENSE_SIGNING_PRIVATE_KEY`, no private material, and unchanged `requiresLicense` values.

- [ ] **Step 2: Compare normalized customer manifests against Task 3 PREVIEW ZIPs.**

For each plan, sort every ZIP entry path and pair it with SHA-256 of the uncompressed bytes; compare exact manifests. Expected: Task 4 customer manifests equal Task 3 manifests byte-for-byte by path/content.

- [ ] **Step 3: Split implementation into tests-first and implementation patches and verify pristine RED→GREEN reconstruction from Task 3 Master.**

Record exact SHA-256 for both patch byte streams. RED must fail only at intended missing Task 4 behaviors. After implementation patch, focused schema/signing/worker/package checks must be GREEN.

- [ ] **Step 4: Create CI workflow that reconstructs from immutable Task 3 REVIEW.**

Workflow sequence: verify patch bytes; download artifact `9348923137`; verify outer SHA and Master SHA; verify baseline migration/verifier/customer manifests; apply tests and prove RED; apply implementation and prove GREEN; create immutable Task 4 Master candidate; run root `npm ci`, full root `npm test`, root lint/types/Pages/VPS builds; run `control-plane/npm ci`, tests/typecheck/D1 smoke; generate PREVIEW packages only; perform strict customer-manifest closure; scan for private material; upload REVIEW artifact; persist evidence with `customer_ready=false`.

- [ ] **Step 5: Independently download and verify the final artifact.**

Verify outer artifact digest, five inner ZIP hashes/integrity, customer 206-entry exact counts, normalized Task 3 customer manifest equality, verifier SHA, no `0008`, no vendor/private leakage, and Control Plane schema/signer sources present only in Master REVIEW.

- [ ] **Step 6: Run verification-before-completion and finish the branch.**

Do not label Task 4 CUSTOMER-READY. Base branch for integration is `agent/v16-task3-signed-token-verifier`.
