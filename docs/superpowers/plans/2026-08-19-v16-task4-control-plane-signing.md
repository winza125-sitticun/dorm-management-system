# V16 Task 4 — Control Plane Schema + Ed25519 Signing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the vendor-only Control Plane D1 schema, hash-only license-key contract, and Ed25519 signer that emits tokens accepted by the Task 3 customer verifier, without adding activation HTTP APIs or changing customer runtime authority.

**Architecture:** Reconstruct the exact Task 3 REVIEW Master from artifact `9348923137`, then apply Task 4 as isolated test and implementation patches. All new Control Plane code lives under vendor-only `control-plane/`; customer packages must remain exact 206-entry PREVIEW packages with migration ceiling `0007_add_license_state.sql`.

**Tech Stack:** Node 22, TypeScript, Web Crypto Ed25519, Cloudflare Workers/D1, SQLite migration SQL, Node test runner, existing package builder/audit scripts.

**Spec:** `docs/superpowers/specs/2026-08-19-v16-task4-control-plane-signing-design.md`

## Global Constraints

- Product baseline is Task 3 artifact ID `9348923137` only.
- Verify outer artifact SHA-256 `98382e591e5c9c5027026011ccac6d66702ed18c576603060e7860d66313c682` before extraction.
- Verify inner Task 3 Master SHA-256 `c4f6eeed671b96e99f54fcd71504e16ad1b268014636f2d5f57eb4289f3e51c7` before patching.
- Customer migration ceiling stays exactly `0007_add_license_state.sql`; no customer `0008` migration.
- Customer PREVIEW ZIPs stay exactly 206 entries.
- `control-plane/` is vendor-only and must never appear in Demo/Basic/Standard/Pro packages.
- `LICENSE_SIGNING_PRIVATE_KEY` is a secret binding name only; no value/private material is committed, logged, snapshotted, or included in customer artifacts.
- Task 4 adds no HTTP route, activation/refresh/deactivation endpoint, seat-allocation transaction, public-key injection, customer token persistence, grace/read-only enforcement, or production deployment.
- Task 4 output remains REVIEW with `customer_ready=false`.

---

### Task 1: Control Plane D1 schema

**Files:**
- Create: `control-plane/migrations/0001_initial_license_control_plane.sql`
- Create: `control-plane/tests/schema.test.mjs`
- Create: `control-plane/package.json`
- Create: `control-plane/package-lock.json`
- Create: `control-plane/wrangler.template.jsonc`

**Interfaces:**
- Consumes: no customer D1 objects.
- Produces: tables `licenses`, `activations`, `license_events` in the vendor Control Plane D1 only.

- [ ] **Step 1: Write the failing schema test**

Create `control-plane/tests/schema.test.mjs` that reads the migration and asserts exact filename/table names, required columns, plan/status checks, `max_activations >= 1`, unique `key_hash`, unique `(license_id, installation_id)`, and absence of raw key/IP/User-Agent/customer-business columns.

- [ ] **Step 2: Run the test against pristine Task 3**

Run:

```bash
node --test control-plane/tests/schema.test.mjs
```

Expected: FAIL because `control-plane/migrations/0001_initial_license_control_plane.sql` does not exist.

- [ ] **Step 3: Add the minimal migration**

Create exactly:

```sql
CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  customer_label TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('basic','standard','pro')),
  status TEXT NOT NULL CHECK (status IN ('active','suspended','revoked','expired')),
  max_activations INTEGER NOT NULL DEFAULT 1 CHECK (max_activations >= 1),
  expires_at INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  project_name TEXT,
  primary_hostname TEXT,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (license_id) REFERENCES licenses(id),
  UNIQUE (license_id, installation_id)
);

CREATE TABLE license_events (
  id TEXT PRIMARY KEY,
  license_id TEXT,
  installation_id TEXT,
  kind TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 4: Add vendor-only package and Wrangler template**

`control-plane/package.json` must contain only the dependencies/scripts needed to run local schema/signing tests. `wrangler.template.jsonc` must define a placeholder D1 binding and must not contain production IDs or private key values.

- [ ] **Step 5: Prove schema GREEN including real SQLite/D1 behavior**

Run the static test and a local D1/SQLite smoke that applies `0001_initial_license_control_plane.sql`, then attempts invalid plan/status/max_activations and duplicate `key_hash` / duplicate activation identity inserts. Each invalid insert must fail.

---

### Task 2: Hash-only license-key contract and repository primitives

**Files:**
- Create: `control-plane/src/licenseRepository.ts`
- Create: `control-plane/tests/licenseRepository.test.ts`

**Interfaces:**
- Produces: `hashLicenseKey(rawLicenseKey: string): Promise<string>` plus read-only repository helpers for later APIs.
- Must not persist or return plaintext license keys.

- [ ] **Step 1: Write RED tests for normalization/hash behavior**

Tests must prove trim-only normalization, case/internal-character preservation, lowercase 64-character SHA-256 hex, deterministic hashes, distinct-key separation, empty input rejection, and error messages that do not include the supplied raw key.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test control-plane/tests/licenseRepository.test.ts
```

Expected: FAIL because `control-plane/src/licenseRepository.ts` does not exist.

- [ ] **Step 3: Implement minimal hash function**

Use `TextEncoder`, `crypto.subtle.digest('SHA-256', ...)`, and lowercase hex encoding. Do not lowercase/uppercase the key itself and do not log it.

- [ ] **Step 4: Add minimal repository reads only**

Allow helpers such as `findLicenseById`, `findLicenseByKeyHash`, and activation count/list reads if required by tests. Do not add activation mutation or seat allocation logic.

- [ ] **Step 5: Run GREEN**

```bash
npx tsx --test control-plane/tests/licenseRepository.test.ts
```

Expected: PASS with zero raw-key leakage.

---

### Task 3: Ed25519 private-key import and Task 3-compatible signer

**Files:**
- Create: `control-plane/src/token.ts`
- Create: `control-plane/src/signing.ts`
- Create: `control-plane/tests/signing.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SignLicensePayloadInput {
  licenseId: string;
  installationId: string;
  plan: 'basic' | 'standard' | 'pro';
  status: 'active' | 'suspended' | 'revoked' | 'expired';
  issuedAt: number;
  expiresAt: number;
  refreshAfter: number;
}

export async function importLicenseSigningPrivateKey(
  pkcs8Base64Url: string,
): Promise<CryptoKey>;

export async function signLicenseToken(
  payload: SignLicensePayloadInput,
  privateKey: CryptoKey,
): Promise<string>;
```

- [ ] **Step 1: Write RED signing tests**

Generate ephemeral Ed25519 keypairs at runtime. Export the private key as PKCS#8 and public key as SPKI. Tests must cover Basic/Standard/Pro, exact `dormlic1` envelope, exact canonical Task 3 byte order, Task 3 verifier interoperability, payload tamper, wrong key, malformed PKCS#8, empty IDs, invalid plan/status, non-integer timestamps, and invalid timestamp order.

- [ ] **Step 2: Run RED**

```bash
npx tsx --test control-plane/tests/signing.test.ts
```

Expected: FAIL because signing/token modules do not exist.

- [ ] **Step 3: Implement canonical vendor token builder**

`control-plane/src/token.ts` must serialize exactly:

```ts
JSON.stringify({
  v: 1,
  licenseId: payload.licenseId,
  installationId: payload.installationId,
  plan: payload.plan,
  status: payload.status,
  issuedAt: payload.issuedAt,
  expiresAt: payload.expiresAt,
  refreshAfter: payload.refreshAfter,
});
```

No optional fields or alternate order.

- [ ] **Step 4: Implement strict PKCS#8 base64url import**

Reject padding/invalid base64url and import using Web Crypto Ed25519 for `sign`. Any failure must use a deterministic generic error without embedding key bytes or raw crypto exception text.

- [ ] **Step 5: Implement minimal signer**

Validate payload, sign canonical UTF-8 bytes, and return:

```text
dormlic1.<unpadded-base64url-canonical-json>.<unpadded-base64url-signature>
```

- [ ] **Step 6: Prove cross-boundary GREEN**

Run:

```bash
npx tsx --test control-plane/tests/signing.test.ts tests/license-token-canonicalization.test.ts tests/license-token-verification.test.ts
```

Expected: all vendor-generated valid tokens verify through the exact Task 3 customer verifier.

---

### Task 4: Preserve vendor/customer package boundary

**Files:**
- Modify: `scripts/build-packages.mjs`
- Modify: `scripts/package-audit.mjs`
- Modify: `tests/package-builder.test.mjs`
- Modify: `tests/package-audit.test.mjs`
- Modify/Create: focused Task 4 package-boundary regression if needed.

**Interfaces:**
- Customer packages must remain unchanged at 206 entries.
- Entire `control-plane/` root remains Master/vendor-only.

- [ ] **Step 1: Write RED package-boundary regressions**

Tests must prove that a staged `control-plane/` root is removed by the builder and rejected by the audit, including nested migrations/tests/source and signing-secret marker content.

- [ ] **Step 2: Run RED against pristine Task 3 builder/audit**

Run focused package-builder/package-audit tests and confirm failures are specifically caused by the new Control Plane vendor root expectations.

- [ ] **Step 3: Make the smallest builder/audit change**

Update exact Master-only/vendor-only boundary lists only. Do not broadly remove customer-shippable tests or refactor unrelated packaging logic.

- [ ] **Step 4: Generate PREVIEW packages**

```bash
npm run packages:generate
```

- [ ] **Step 5: Strictly verify all four packages**

For Demo/Basic/Standard/Pro assert:
- exact 206 entries
- no `control-plane/`
- no `LICENSE_SIGNING_PRIVATE_KEY`
- no private PKCS#8/PEM/JWK material
- migration ceiling `0007_add_license_state.sql`
- byte-identical `src/server/services/licenseToken.service.ts`
- Task 1 `requiresLicense` values unchanged.

---

### Task 5: Split immutable patches and prove pristine RED→GREEN reconstruction

**Files:**
- Create: `v16-task4-patches/001-tests.patch` or ordered `.partNN` fragments
- Create: `v16-task4-patches/002-implementation.patch` or ordered `.partNN` fragments

- [ ] **Step 1: Reconstruct pristine Task 3 Master**

Verify outer and inner hashes before any edit.

- [ ] **Step 2: Apply tests patch only**

Run schema/hash/signing/package boundary suites and prove intended RED. Reject harness/syntax failures as invalid RED.

- [ ] **Step 3: Apply implementation patch**

Run focused suites and prove GREEN.

- [ ] **Step 4: Record exact patch SHA-256 values**

CI must reconstruct fragments, if fragments are used, and verify the full patch SHA before touching the Master.

---

### Task 6: Task 4 GitHub CI REVIEW gate

**Files:**
- Create: `.github/workflows/v16-task4-control-plane-signing-gate.yml`
- Create/update from CI: `v16-task4-evidence/task4-gate-latest.txt`

- [ ] **Step 1: Build immutable workflow lineage**

Workflow must:
1. checkout `agent/v16-task4-control-plane-signing`
2. reconstruct/verify exact Task 4 patch bytes
3. download Task 3 artifact `9348923137`
4. verify outer SHA `98382e591e5c9c5027026011ccac6d66702ed18c576603060e7860d66313c682`
5. verify inner Master SHA `c4f6eeed671b96e99f54fcd71504e16ad1b268014636f2d5f57eb4289f3e51c7`
6. prove tests-only RED
7. apply implementation and prove focused GREEN
8. `npm ci` for customer and `control-plane/` lockfiles
9. run Control Plane schema/hash/signing tests
10. run full customer `npm test`
11. run TypeScript lint / Cloudflare type checks
12. run Pages and VPS production builds
13. generate PREVIEW packages only
14. enforce exact 206-entry customer closure and no vendor/private leakage
15. upload Task 4 REVIEW artifact/evidence
16. persist `customer_ready=false`

- [ ] **Step 2: Do not deploy Control Plane**

No production `wrangler deploy`, no production D1 migration, and no secret provisioning occurs in Task 4.

- [ ] **Step 3: Independent closure**

Download final artifact and independently verify outer digest, inner manifest hashes, ZIP integrity, Control Plane source presence in Master only, customer 206-entry boundary, migration ceiling, verifier parity, and absence of signing private material.

## Exit checklist

Task 4 may be called complete only after fresh evidence proves:
- vendor D1 schema and constraints work on a fresh local database
- license-key storage is hash-only
- Ed25519 signer output verifies through Task 3 verifier
- private signing value never appears in repository/customer artifacts/log evidence
- no activation HTTP/seat logic was added
- customer packages remain exact 206 entries with migration ceiling `0007`
- full customer regression/lint/types/builds pass
- final artifact is REVIEW-only with `customer_ready=false`
