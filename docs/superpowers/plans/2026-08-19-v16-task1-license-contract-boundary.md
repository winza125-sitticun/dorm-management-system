# V16 Task 1 — License Contract + Vendor Boundary Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict package-level license metadata and vendor-only leak boundaries to the immutable V15 Master without changing customer runtime behavior or adding a database migration.

**Architecture:** Reconstruct the working tree only from V15 final artifact `9330679827`, then apply a small test-first patch to the existing package builder and package audit. `requiresLicense` stays build metadata only. `control-plane/` is excluded at the builder boundary and rejected at the audit boundary; the private signing-secret identifier is rejected by the existing text scan before any signer exists.

**Tech Stack:** Node.js 22, ECMAScript modules, `node:test`, GitHub Actions, ZIP package builder/audit.

**Spec:** `docs/superpowers/specs/2026-08-19-v16-task1-license-contract-boundary-design.md`

## Global Constraints

- Source artifact ID: `9330679827` only.
- Outer artifact SHA-256: `5f6e65ae856c1196fcd3a2e3dd7bcffb4da863ab212d3595839e921f0a96e1cf`.
- Master V15 SHA-256: `d05ee110815a29b74498e17adac1b8355dec40d5a705dd016f5ad5f849caa9e9`.
- Never source from blocked artifact `9326820971`, `main`, or V13.
- Latest migration must remain exactly `0006_add_white_label_settings.sql`.
- Do not add runtime license enforcement, `license_state`, activation APIs, signer/verifier code, public keys, read-only gates, or License Settings UI.
- Do not modify or regenerate any V15 CUSTOMER-READY ZIP.
- Task 1 outputs REVIEW/PREVIEW artifacts only; never label them V16 CUSTOMER-READY.

---

### Task 1: Strict `requiresLicense` plan contract

**Files:**
- Modify: `package-plans/demo.json`
- Modify: `package-plans/basic.json`
- Modify: `package-plans/standard.json`
- Modify: `package-plans/pro.json`
- Modify: `scripts/build-packages.mjs`
- Test: `tests/package-builder.test.mjs`

**Interfaces:**
- Consumes: existing `validatePlanConfig(plan)` and `loadPlans(directoryUrl)`.
- Produces: every loaded plan exposes `requiresLicense: boolean`; exact values are Demo=false, Basic/Standard/Pro=true.

- [ ] **Step 1: Write failing plan-contract tests**

Add `requiresLicense` to the existing `expected` fixture and assert the exact value for every plan. Add focused `validatePlanConfig()` cases using otherwise-valid Basic metadata:

```js
const validBasic = {
  id: 'basic', label: 'Basic', packageName: 'dorm-management-system-basic',
  limits: { maxRooms: 10, maxStaff: 0 }, features: ['x'], googleOAuthExample: false,
  requiresLicense: true,
};
assert.throws(() => validatePlanConfig({ ...validBasic, requiresLicense: undefined }), /requiresLicense must be boolean/i);
assert.throws(() => validatePlanConfig({ ...validBasic, requiresLicense: 'true' }), /requiresLicense must be boolean/i);
assert.equal(validatePlanConfig(validBasic).requiresLicense, true);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/package-builder.test.mjs
```

Expected: FAIL because V15 plan JSON has no `requiresLicense` and the validator does not enforce it.

- [ ] **Step 3: Implement the minimal contract**

Set exact JSON booleans:

```text
demo=false
basic=true
standard=true
pro=true
```

In `validatePlanConfig(plan)`, after validating `googleOAuthExample`, add:

```js
if (typeof plan.requiresLicense !== 'boolean') throw new Error(`${plan.id}: requiresLicense must be boolean`);
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/package-builder.test.mjs
```

Expected: PASS.

---

### Task 2: Vendor-only `control-plane/` boundary

**Files:**
- Modify: `scripts/build-packages.mjs`
- Modify: `scripts/package-audit.mjs`
- Test: `tests/package-builder.test.mjs`
- Test: `tests/package-audit.test.mjs`

**Interfaces:**
- Consumes: `shouldCopy(source, extraExcludedRoots)` via `buildPackageTree()` and `auditCustomerTree(root, plan)`.
- Produces: any path under `control-plane/` is absent from generated customer package trees and is independently forbidden by audit.

- [ ] **Step 1: Write failing builder exclusion test**

Create a temporary marker at `control-plane/vendor-only-marker.txt`, build a Demo tree with portable tests disabled, assert the marker does not exist in the staged customer tree, and remove the synthetic vendor directory in `finally`.

- [ ] **Step 2: Write failing audit test**

Create an audit fixture containing `control-plane/vendor-only-marker.txt`; assert an issue matches `/control-plane\/vendor-only-marker\.txt/`.

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/package-builder.test.mjs tests/package-audit.test.mjs
```

Expected: FAIL because V15 neither excludes nor audits `control-plane/`.

- [ ] **Step 4: Implement the minimal boundary**

Append `control-plane/` to `MASTER_PREFIXES` in `scripts/build-packages.mjs` and to `FORBIDDEN_PREFIXES` in `scripts/package-audit.mjs`. Do not add special-case recursive code; existing prefix logic is the boundary.

- [ ] **Step 5: Verify GREEN**

Run the same focused tests. Expected: PASS.

---

### Task 3: Private signing-secret identifier leak gate

**Files:**
- Modify: `scripts/package-audit.mjs`
- Test: `tests/package-audit.test.mjs`

**Interfaces:**
- Consumes: existing `TEXT_EXTENSIONS` scan in `auditCustomerTree()`.
- Produces: customer-readable text containing exact `LICENSE_SIGNING_PRIVATE_KEY` yields a unique audit issue; no private key material is introduced.

- [ ] **Step 1: Write failing secret-marker test**

Create a minimal customer fixture with a text file containing `LICENSE_SIGNING_PRIVATE_KEY=should-never-ship` and assert the audit returns an issue matching `/LICENSE_SIGNING_PRIVATE_KEY/` or `/signing.*secret/i`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/package-audit.test.mjs
```

Expected: FAIL because the identifier is not currently scanned.

- [ ] **Step 3: Implement the minimal scan**

Inside the existing customer text scan add:

```js
if (text.includes('LICENSE_SIGNING_PRIVATE_KEY')) issues.push(`License signing private key identifier leaked: ${rel}`);
```

Do not add a signer, private key, seed, PEM, JWK, or public verifier in this task.

- [ ] **Step 4: Verify GREEN**

Run the audit tests again. Expected: PASS.

---

### Task 4: Regression, patch materialization, and immutable CI gate

**Files:**
- Create on branch: `v16-task1-patches/001-tests.patch`
- Create on branch: `v16-task1-patches/002-implementation.patch`
- Create on branch: `.github/workflows/v16-task1-license-contract-gate.yml`
- Create/update through CI: `v16-task1-evidence/task1-gate-latest.txt`

**Interfaces:**
- Consumes: immutable artifact IDs/hashes above plus test and implementation patches.
- Produces: reproducible V16 Task 1 REVIEW Master and four PREVIEW customer ZIPs, hashes, and evidence; never CUSTOMER-READY.

- [ ] **Step 1: Run static/native regression locally**

```bash
node --check scripts/build-packages.mjs
node --check scripts/package-audit.mjs
node --test tests/package-builder.test.mjs tests/package-parity.test.mjs tests/package-audit.test.mjs tests/package-release.test.mjs tests/master-launchers.test.mjs tests/zip-utils.test.mjs
node scripts/build-packages.mjs --preview
```

Verify every Preview ZIP with the repository ZIP utility or `unzip -t`, and verify no package contains `control-plane/`, `package-plans/`, `docs/superpowers/`, active `.env`/`.dev.vars`, or the exact private signing-secret identifier.

- [ ] **Step 2: Verify migration ceiling**

```bash
latest="$(find d1-migrations -maxdepth 1 -type f -printf '%f\n' | sort | tail -n1)"
test "$latest" = '0006_add_white_label_settings.sql'
```

- [ ] **Step 3: Materialize two ordered patches**

Patch 001 contains tests only and must produce the intended RED state on pristine V15. Patch 002 contains only the four plan JSON changes plus builder/audit implementation and must turn the same test set GREEN.

- [ ] **Step 4: Add GitHub Actions immutable gate**

The workflow must:

1. download artifact `9330679827`;
2. verify the outer ZIP SHA-256 exactly;
3. extract and verify the exact Master SHA-256;
4. verify migration ceiling `0006`;
5. apply patch 001 and run focused tests expecting non-zero RED;
6. apply patch 002 and run focused tests expecting GREEN;
7. run `npm ci`, `npm test`, `npm run lint`, `npm run check:cloudflare-types:master`, `npm run build:pages`, and `npm run build:vps`;
8. run Preview package generation only;
9. audit/unzip all four Preview packages and enforce forbidden-root/secret checks;
10. create `dorm-management-system-master-v16-task1-REVIEW-CI.zip` and four `v16-TASK1-PREVIEW` ZIP copies;
11. upload SHA-256 manifests and source/run evidence;
12. never call `npm run packages:release` and never emit a V16 CUSTOMER-READY filename.

- [ ] **Step 5: Final verification**

Confirm the workflow result and uploaded artifact are tied to the branch source SHA, all exact hashes match, and `git diff --check` is clean. If dependency-backed CI fails, Task 1 remains REVIEW/BLOCKED and no production label is created.