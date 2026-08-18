# V15 Task 8 Final Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the immutable V15 Task 7 candidate satisfies AC-01..AC-10, regenerate one-master V15 CUSTOMER-READY packages, and verify exact final package bytes on Cloudflare before promotion.

**Architecture:** Task 8 does not patch product source. It verifies artifact `9317174783`, runs focused acceptance and full regression/package/security gates against the extracted Task 7 Master, regenerates four plan packages from that one Master, materializes V15 CUSTOMER-READY archives, then deploys the exact Pro and Demo final package bytes to temporary Cloudflare Pages/D1 and reuses the already-validated Task 5, Task 6, and Task 7 browser harnesses for end-to-end runtime evidence.

**Tech Stack:** GitHub Actions, Node.js 22, TypeScript/tsx, npm, Vite, Wrangler/Cloudflare Pages+D1, ZIP/SHA-256 shell tooling.

**Spec:** `docs/superpowers/specs/2026-08-18-v15-task8-final-release-gate-design.md`

## Global Constraints

- Source artifact must stay `9317174783`, digest `sha256:2f475ac6daaae661442b3cb13b60b8d4ed82c74570c2e67ed70a8242bbbf0d3e`.
- Task 8 must not patch product source code during release gating.
- Highest migration must remain `0006_add_white_label_settings.sql` in Master and all four plan packages.
- Demo `whiteLabel=false`; Basic/Standard/Pro `whiteLabel=true`; PromptPay entitlement semantics stay unchanged.
- CUSTOMER-READY naming is allowed only after all pre-release gates pass.
- Final Cloudflare smoke must deploy exact CUSTOMER-READY Pro/Demo package bytes and cleanup every temporary Pages/D1 resource with exit code 0.

---

### Task 1: Add release-only acceptance matrix contract

**Files:**
- Create: `v15-task8/task8-acceptance-matrix.test.mjs`

**Interfaces:**
- Consumes: immutable Task 7 source/tests.
- Produces: one source-level acceptance contract covering AC-01..AC-10 and migration ceiling.

- [ ] **Step 1: Create acceptance test**

The test must read existing Task 5/6/7 contracts and source files, and assert the release matrix contains evidence for:
`AC-01` cross-surface dorm identity, `AC-02` logo parity/fallback, `AC-03` red/dark/default brand + frozen semantic palette, `AC-04` HEX validation, `AC-05` PNG/JPEG/WebP + SVG/>300KB rejection, `AC-06` public secret boundary, `AC-07` branding failure fallback/boot exit, `AC-08` default `#1DB954`, `AC-09` Demo/Basic/Standard/Pro entitlement matrix, `AC-10` optional-value clearing/reset behavior. It must also assert the latest migration filename is `0006_add_white_label_settings.sql`.

- [ ] **Step 2: Verify against exact Task 7 Master**

Run:
```bash
node --test tests/task8-acceptance-matrix.test.mjs
```
Expected: PASS on the immutable Task 7 Master; any failure blocks release and no product patch is applied.

- [ ] **Step 3: Commit release-only test**

```bash
git add v15-task8/task8-acceptance-matrix.test.mjs
git commit -m "test(v15-task8): add final acceptance matrix contract"
```

### Task 2: Build pre-release production/acceptance gate

**Files:**
- Create: `.github/workflows/v15-task8-production-release-gate.yml`
- Create: `v15-task8-evidence/production-release-latest.txt` at runtime.

**Interfaces:**
- Consumes: Task 7 artifact ID/digest, Task 8 acceptance test hash.
- Produces: immutable V15 CUSTOMER-READY candidate artifact and acceptance matrix JSON.

- [ ] **Step 1: Pin and verify Task 7 artifact**

Workflow must download artifact `9317174783`, verify outer digest, Master SHA `2d9a1a17bfc6a0e4da1edf0cda2fc4c9a488a2f5807bc16e36cabafea8aff231`, and plan candidate SHAs:
- Demo `ad02052c10fb50eb4d48c13caa5cdc3e553a85b28689b4255a519a7c4d703946`
- Basic `908a2147055a1e9b91f40f78b5f95a65ee41e0cdb54bca074a690a87a3ff0a57`
- Standard `ab987a18f79f0ef3de0dd0fa8ef73e54f1de2df223c24060d33f818d53669af4`
- Pro `5fe906c99f22a92325015b7800079af6d68b3c08f13d3285e7093791bccf1916`

- [ ] **Step 2: Run focused acceptance and existing contracts**

Run Task 8 contract plus existing runtime/validation contracts:
```bash
node --test tests/task8-acceptance-matrix.test.mjs tests/task5-login-app-shell-branding.test.mjs tests/task6-bill-branding.test.mjs tests/task7-tenant-portal-branding.test.mjs
npx tsx --test tests/brand-theme-runtime.test.ts tests/theme-root-runtime.test.ts tests/theme-refresh-runtime.test.ts tests/branding-client-runtime.test.ts tests/settings-white-label.test.ts tests/logo-validation.test.ts tests/logo-api-contract.test.ts tests/public-branding.test.ts tests/plan-entitlements.test.ts tests/plan-api-guards.test.ts tests/bill-branding-snapshot.test.ts
```
Expected: all PASS.

- [ ] **Step 3: Run complete fresh release verification**

Run:
```bash
npm ci
npm test
npm run lint
npm run check:cloudflare-types:master
npm run build:pages
npm run build:vps
npm run packages:generate
npm run test:builder
npm run packages:release
```
Expected: every command exits 0.

- [ ] **Step 4: Materialize final V15 CUSTOMER-READY packages from one Master**

Copy only generated guarded release package outputs into:
```text
release-v15/
  dorm-management-system-demo-v15-CUSTOMER-READY.zip
  dorm-management-system-basic-v15-CUSTOMER-READY.zip
  dorm-management-system-standard-v15-CUSTOMER-READY.zip
  dorm-management-system-pro-v15-CUSTOMER-READY.zip
```
Create `dorm-management-system-master-v15-CUSTOMER-READY.zip` from the exact verified Master workspace after release verification, then generate `V15_CUSTOMER_READY_SHA256.txt` covering Master + all four plan ZIPs.

- [ ] **Step 5: Four-plan package regression and migration audit**

For each final plan ZIP: verify ZIP integrity, extract, assert migration ceiling `0006_add_white_label_settings.sql`, audit plan entitlement package metadata, and run focused package contracts using the verified Node toolchain. Plan-specific generated differences must be limited to approved package/entitlement configuration; White-label product source files must match across plans.

- [ ] **Step 6: Security/secret audit**

Block release if final Master or any final plan contains forbidden credential artifacts such as `.env`, private key/certificate material, credential JSON, smoke token/password files, or release-smoke runtime files. Verify public branding tests pass and no generated customer package contains temporary Cloudflare/D1 smoke configuration values.

- [ ] **Step 7: Emit acceptance matrix JSON and artifact**

Create `v15-task8-acceptance-matrix.json` with AC-01..AC-10, each `pass:true` and explicit evidence command/test names. Upload one artifact named `v15-task8-customer-ready-pending-final-cloudflare-smoke` containing Master, all four final plan ZIPs, SHA manifest, and acceptance matrix. Persist run/source/artifact lineage pointer.

### Task 3: Build final exact-byte Cloudflare smoke

**Files:**
- Create: `.github/workflows/v15-task8-final-cloudflare-smoke.yml`
- Reuse unchanged: `v15-task5/browser-smoke.mjs`
- Reuse unchanged: `v15-task6/browser-export-smoke-v2.mjs`
- Reuse unchanged: `v15-task7/portal-smoke.mjs`
- Create at runtime: `v15-task8-evidence/final-cloudflare-smoke-latest.txt`

**Interfaces:**
- Consumes: Task 8 CUSTOMER-READY artifact ID/digest and exact Pro/Demo final ZIP SHAs.
- Produces: final runtime evidence for Login/App/Bill/JPG/Print-PDF/Portal/Demo masking and cleanup.

- [ ] **Step 1: Pin exact final artifact and harness blobs**

Workflow must verify final artifact digest, SHA manifest, Pro/Demo ZIP SHA, and Git blob hashes for all three reused browser harnesses before deployment.

- [ ] **Step 2: Create temporary Pro/Demo D1 + Pages**

Create unique APAC D1 databases and Pages projects, render config, apply migrations through `0006`, build/deploy exact final Pro/Demo package bytes, and wait for TLS/HTTP readiness.

- [ ] **Step 3: Seed real data and branding**

Create real owners/login, Pro effective custom branding with valid logo/footer/contact, Demo dormant paid branding that must be masked, and real occupied rooms/bills required by Bill and Tenant Portal flows.

- [ ] **Step 4: Execute three runtime harnesses per plan**

For Pro and Demo run:
- Task 5 Login + desktop/mobile app-shell browser smoke.
- Task 6 Bill preview + JPG + Print/PDF browser/export smoke.
- Task 7 Tenant Portal lookup + active portal browser smoke.

Expected Pro: custom brand/logo/effective identity. Expected Demo: `#1DB954`, no paid logo/footer/contact leaks.

- [ ] **Step 5: Cleanup and assert**

Delete both Pages projects and both D1 databases. Require all four cleanup exit codes `0`. Upload runtime JSON + cleanup evidence and persist final smoke pointer with exact run attempt/source artifact lineage.

### Task 4: Promote final status only from fresh evidence

**Files:**
- Create: `V15_TASK8_STATUS_TH.md`

**Interfaces:**
- Consumes: production release gate evidence + final Cloudflare smoke evidence.
- Produces: auditable V15 release decision.

- [ ] **Step 1: Verify production-release run and artifact**

Confirm job conclusion success, every required step success, acceptance matrix AC-01..AC-10 all PASS, and retrieve exact CUSTOMER-READY artifact metadata/digest.

- [ ] **Step 2: Verify final Cloudflare smoke**

Confirm exact final artifact lineage, Pro and Demo runtime evidence PASS, final smoke artifact contents, and cleanup all zero.

- [ ] **Step 3: Write release status**

`V15_TASK8_STATUS_TH.md` must record source SHA, Task 7 artifact lineage, Task 8 run IDs/attempts, final artifact IDs/digests, Master + four plan SHA-256 values, AC-01..AC-10 PASS evidence, migration ceiling, Cloudflare smoke result, and cleanup result.

- [ ] **Step 4: Release decision**

Only if all evidence above is fresh and green, mark `V15 CUSTOMER-READY`. Do not merge `main` automatically; report that merge is a separate explicit action.
