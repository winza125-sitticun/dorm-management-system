# V16 Task 3 — Signed License Token Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic V1 signed-license token contract and customer-side Ed25519 verifier without changing runtime plan authority or persisting verified tokens.

**Architecture:** Keep Task 3 crypto logic isolated in `src/server/services/licenseToken.service.ts`. The module uses only Web Crypto + Web platform primitives (`crypto.subtle`, `TextEncoder`, `TextDecoder`, `atob`, `btoa`), enforces exact canonical payload bytes, imports publishable Ed25519 SPKI public keys, and returns typed payloads only after fail-closed validation. Task 3 does not add a migration, Control Plane code, API wiring, D1 writes, or production key values.

**Tech Stack:** TypeScript, Node.js 22, Web Crypto Ed25519, TSX test runner, Node test runner, existing V14/V15/V16 package builder/audit tooling, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-19-v16-task3-signed-license-token-verifier-design.md`

## Global Constraints

- Reconstruct only from Task 2 REVIEW V2 artifact `9347482894`.
- Task 2 artifact SHA-256 must equal `fb613ddafa3ed945dc619e498f66132312e37b1c9ea5005ecd7f3cd1e35692de`.
- Task 2 Master SHA-256 must equal `47fb6f2d7d67f75b6c19ad73943d4157269d7e059608b7730ff0ed455d235e7b`.
- Task 2 blocked run/artifact `32200435545` / `9347320043` must never be used.
- Migration ceiling remains exactly `0007_add_license_state.sql`; no `0008` migration is allowed.
- Wire envelope is exactly `dormlic1.<payload-base64url>.<signature-base64url>`.
- Canonical key order is exactly `v,licenseId,installationId,plan,status,issuedAt,expiresAt,refreshAfter`.
- Allowed plans: `basic`, `standard`, `pro`.
- Allowed statuses: `active`, `suspended`, `revoked`, `expired`.
- No JWT library or crypto dependency is added.
- No production public key value and no private signing material is committed.
- `license_state`, `.dormbackup`, `settings.subscription_plan`, and plan-authority behavior remain unchanged.
- Task 3 tests are Master-only and must not ship to customer ZIPs.
- Customer PREVIEW package entry count must be exactly `206` for Demo/Basic/Standard/Pro.
- Task 3 remains REVIEW-only with `customer_ready=false`.

---

### Task 1: Canonical V1 payload and strict envelope primitives

**Files:**
- Create: `tests/license-token-canonicalization.test.ts`
- Create: `src/server/services/licenseToken.service.ts`

**Interfaces:**
- Produces `LicenseTokenPlan`, `LicenseTokenStatus`, `LicenseTokenPayloadV1`, `LicenseTokenErrorCode`, `LicenseTokenError`, and `canonicalizeLicenseTokenPayload()`.
- Establishes private strict base64url encode/decode helpers later used by `importLicensePublicKey()` and `verifyLicenseToken()`.

- [ ] **Step 1: Write the canonicalization RED test**

Use this approved payload:

```ts
const payload = {
  v: 1 as const,
  licenseId: 'lic_standard_001',
  installationId: '11111111-2222-4333-8444-555555555555',
  plan: 'standard' as const,
  status: 'active' as const,
  issuedAt: 1786870000,
  expiresAt: 1789462000,
  refreshAfter: 1786956400,
};
```

Assert exact output:

```ts
'{"v":1,"licenseId":"lic_standard_001","installationId":"11111111-2222-4333-8444-555555555555","plan":"standard","status":"active","issuedAt":1786870000,"expiresAt":1789462000,"refreshAfter":1786956400}'
```

Also assert repeated calls return identical strings.

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test tests/license-token-canonicalization.test.ts
```

Expected: FAIL because `src/server/services/licenseToken.service.ts` does not exist.

- [ ] **Step 3: Add the minimal public types/error class/canonicalizer**

Create these public declarations exactly:

```ts
export type LicenseTokenPlan = 'basic' | 'standard' | 'pro';
export type LicenseTokenStatus = 'active' | 'suspended' | 'revoked' | 'expired';

export interface LicenseTokenPayloadV1 {
  v: 1;
  licenseId: string;
  installationId: string;
  plan: LicenseTokenPlan;
  status: LicenseTokenStatus;
  issuedAt: number;
  expiresAt: number;
  refreshAfter: number;
}

export type LicenseTokenErrorCode =
  | 'LICENSE_TOKEN_INVALID'
  | 'LICENSE_TOKEN_WRONG_INSTALLATION'
  | 'LICENSE_TOKEN_EXPIRED'
  | 'LICENSE_PUBLIC_KEY_INVALID';

export class LicenseTokenError extends Error {
  readonly code: LicenseTokenErrorCode;
  constructor(code: LicenseTokenErrorCode) {
    super(code);
    this.name = 'LicenseTokenError';
    this.code = code;
  }
}
```

Implement canonicalization with a newly constructed object in fixed order:

```ts
export function canonicalizeLicenseTokenPayload(payload: LicenseTokenPayloadV1): string {
  return JSON.stringify({
    v: payload.v,
    licenseId: payload.licenseId,
    installationId: payload.installationId,
    plan: payload.plan,
    status: payload.status,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    refreshAfter: payload.refreshAfter,
  });
}
```

Add private strict base64url helpers using only Web APIs. Input must be non-empty, unpadded, match `^[A-Za-z0-9_-]+$`, reject length remainder `1`, decode with `atob`, and round-trip re-encode to the exact original segment before accepting it.

- [ ] **Step 4: Run GREEN**

Run:

```bash
npx tsx --test tests/license-token-canonicalization.test.ts
```

Expected: PASS.

---

### Task 2: Ed25519 SPKI import and fail-closed token verification

**Files:**
- Modify: `src/server/services/licenseToken.service.ts`
- Create: `tests/license-token-verification.test.ts`

**Interfaces:**
- Consumes canonicalization/base64url primitives from Task 1.
- Produces:

```ts
export async function importLicensePublicKey(spkiBase64Url: string): Promise<CryptoKey>;
export async function verifyLicenseToken(
  token: string,
  publicKey: CryptoKey,
  expectedInstallationId: string,
  nowEpochSeconds: number,
): Promise<LicenseTokenPayloadV1>;
```

- [ ] **Step 1: Write RED verification tests with runtime-generated keys only**

In the test, generate ephemeral keys:

```ts
const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
```

Use a test-only `toBase64Url()` helper and a test-only token signer that signs `new TextEncoder().encode(canonicalizeLicenseTokenPayload(payload))` with the ephemeral private key. Never serialize/export the private key.

Cover at minimum:

- valid Basic, Standard, Pro
- exact returned payload
- wrong prefix / missing segment / extra segment / empty segment
- padded and invalid base64url
- malformed UTF-8 / malformed JSON
- reordered keys / unknown field / added whitespace / duplicate-key representation
- unsupported version
- empty/whitespace license ID
- empty/whitespace installation ID
- unknown plan/status
- non-integer timestamps
- invalid `issuedAt <= refreshAfter <= expiresAt` ordering
- invalid `nowEpochSeconds`
- wrong installation -> `LICENSE_TOKEN_WRONG_INSTALLATION`
- `now = expiresAt - 1` valid
- `now >= expiresAt` -> `LICENSE_TOKEN_EXPIRED`
- payload tamper / signature tamper / different signing key -> `LICENSE_TOKEN_INVALID`
- valid SPKI import
- malformed base64url SPKI and invalid DER SPKI -> `LICENSE_PUBLIC_KEY_INVALID`

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test tests/license-token-verification.test.ts
```

Expected: FAIL because public-key import and verifier exports are missing.

- [ ] **Step 3: Implement strict payload validation**

Implement an internal validator that accepts only a plain object with exactly these own enumerable keys in set terms:

```ts
[
  'v', 'licenseId', 'installationId', 'plan', 'status',
  'issuedAt', 'expiresAt', 'refreshAfter',
]
```

Require:

```ts
v === 1
licenseId.trim().length > 0
installationId.trim().length > 0
plan in new Set(['basic','standard','pro'])
status in new Set(['active','suspended','revoked','expired'])
Number.isFinite(timestamp) && Number.isInteger(timestamp)
issuedAt <= refreshAfter && refreshAfter <= expiresAt
```

Return a freshly constructed `LicenseTokenPayloadV1` rather than returning the parsed object.

- [ ] **Step 4: Implement SPKI import**

Implementation contract:

```ts
export async function importLicensePublicKey(spkiBase64Url: string): Promise<CryptoKey> {
  try {
    const bytes = decodeBase64UrlStrict(spkiBase64Url);
    return await crypto.subtle.importKey(
      'spki',
      bytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
  } catch {
    throw new LicenseTokenError('LICENSE_PUBLIC_KEY_INVALID');
  }
}
```

Do not include raw crypto exception text in the error.

- [ ] **Step 5: Implement `verifyLicenseToken()` in the approved fail-closed order**

Required sequence:

1. Validate `nowEpochSeconds` is a finite integer, else `LICENSE_TOKEN_INVALID`.
2. Split token and require exactly `['dormlic1', payloadSegment, signatureSegment]` with non-empty payload/signature.
3. Strict-decode payload/signature base64url.
4. UTF-8 decode payload using `new TextDecoder('utf-8', { fatal: true })`.
5. `JSON.parse` and strict-validate exact V1 payload structure.
6. Re-canonicalize and require byte-for-byte equality with decoded payload bytes.
7. Require `installationId === expectedInstallationId`, else `LICENSE_TOKEN_WRONG_INSTALLATION`.
8. Require `nowEpochSeconds < expiresAt`, else `LICENSE_TOKEN_EXPIRED`.
9. Verify Ed25519 signature over canonical UTF-8 payload bytes using `crypto.subtle.verify({ name: 'Ed25519' }, publicKey, signatureBytes, canonicalBytes)`.
10. If verify returns false or throws, map to `LICENSE_TOKEN_INVALID`.
11. Return the validated payload.

All malformed token conditions map to `LICENSE_TOKEN_INVALID`; only the two explicit claim errors and public-key import use their distinct codes.

- [ ] **Step 6: Run GREEN and TypeScript checks**

Run:

```bash
npx tsx --test tests/license-token-canonicalization.test.ts tests/license-token-verification.test.ts
npm run lint
npm run check:cloudflare-types:master
```

Expected: all pass.

---

### Task 3: Lock Task 3 crypto tests as Master-only package content

**Files:**
- Modify: `tests/package-builder.test.mjs`
- Modify: `tests/package-audit.test.mjs`
- Modify: `scripts/build-packages.mjs`
- Modify: `scripts/package-audit.mjs`

**Interfaces:**
- Keeps production verifier customer-shippable.
- Keeps these exact files Master-only:
  - `tests/license-token-canonicalization.test.ts`
  - `tests/license-token-verification.test.ts`

- [ ] **Step 1: Write RED package-boundary tests**

Add a builder test that calls `buildPackageTree()` and asserts both Task 3 test paths are absent.

Add an audit test that creates those exact paths under a temporary customer tree and asserts `auditCustomerTree()` reports both paths.

Do not add a blanket `tests/` exclusion because customer packages intentionally ship existing customer tests.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/package-builder.test.mjs tests/package-audit.test.mjs
```

Expected: two Task 3 boundary assertions fail because the new tests are not yet in the explicit Master-only sets.

- [ ] **Step 3: Add exact Master-only entries**

Append exactly these paths to `MASTER_ONLY` in `scripts/build-packages.mjs` and `FORBIDDEN_EXACT` in `scripts/package-audit.mjs`:

```text
tests/license-token-canonicalization.test.ts
tests/license-token-verification.test.ts
```

Do not change `MASTER_PREFIXES` or exclude the production verifier.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test tests/package-builder.test.mjs tests/package-audit.test.mjs
```

Expected: PASS.

---

### Task 4: Package parity, migration freeze, and private-material closure

**Files:**
- Modify: `tests/package-parity.test.mjs`
- Modify only if a failing assertion requires it: `scripts/package-audit.mjs`

**Interfaces:**
- Customer product delta from Task 2 is exactly one production file: `src/server/services/licenseToken.service.ts`.
- Expected package entry count becomes exactly `206`.

- [ ] **Step 1: Add package parity assertions**

After `npm run packages:generate`, assert for Demo/Basic/Standard/Pro:

- exactly 206 entries
- `src/server/services/licenseToken.service.ts` exists in every ZIP/tree
- verifier file bytes/hash are identical across all four plans
- latest migration remains `0007_add_license_state.sql`
- no `0008*`
- both Task 3 crypto test files are absent
- `control-plane/` is absent
- `LICENSE_SIGNING_PRIVATE_KEY` is absent
- no PEM private-key header such as `-----BEGIN PRIVATE KEY-----` or `-----BEGIN ED25519 PRIVATE KEY-----` appears in customer output
- Task 1 `requiresLicense` values remain Demo=false, Basic/Standard/Pro=true

- [ ] **Step 2: Run package generation and parity GREEN**

Run:

```bash
npm run packages:generate
node --test tests/package-parity.test.mjs tests/package-builder.test.mjs tests/package-audit.test.mjs tests/package-release.test.mjs
```

Expected: PASS and exactly 206 entries for all four plans.

- [ ] **Step 3: Run full local verification before patch split**

Run:

```bash
npm test
npm run lint
npm run check:cloudflare-types:master
npm run build:pages
npm run build:vps
```

Expected: all exit 0. Do not label CUSTOMER-READY.

---

### Task 5: Immutable patch reconstruction and GitHub Actions REVIEW gate

**Files:**
- Create: `v16-task3-patches/001-tests.patch`
- Create: `v16-task3-patches/002-implementation.patch`
- Create: `.github/workflows/v16-task3-signed-token-gate.yml`
- Create/update via workflow: `v16-task3-evidence/task3-gate-latest.txt`

**Interfaces:**
- Reconstructs product candidate from immutable Task 2 REVIEW V2 artifact only.
- Produces V16 Task 3 REVIEW artifact only, never CUSTOMER-READY.

- [ ] **Step 1: Split patches**

`001-tests.patch` contains only Task 3 test changes.

`002-implementation.patch` contains:

- `src/server/services/licenseToken.service.ts`
- `scripts/build-packages.mjs`
- `scripts/package-audit.mjs`
- any minimum production/audit change required by Task 3 tests

Record SHA-256 for both patch files and verify canonical file bytes after upload.

- [ ] **Step 2: Reconstruct pristine Task 2 and prove RED -> GREEN**

From a fresh extraction whose Master ZIP SHA equals `47fb6f2d7d67f75b6c19ad73943d4157269d7e059608b7730ff0ed455d235e7b`:

1. apply tests patch only
2. run focused canonicalization/verification/package-boundary tests and require non-zero status with intended failures
3. apply implementation patch
4. rerun focused suite and require zero failures
5. verify migration ceiling still `0007_add_license_state.sql`
6. generate packages and require exact 206 entries

- [ ] **Step 3: Create CI gate**

Workflow must:

1. checkout `agent/v16-task3-signed-token-verifier`
2. verify patch SHA-256 values
3. download artifact `9347482894`
4. verify outer SHA `fb613ddafa3ed945dc619e498f66132312e37b1c9ea5005ecd7f3cd1e35692de`
5. verify/extract Master SHA `47fb6f2d7d67f75b6c19ad73943d4157269d7e059608b7730ff0ed455d235e7b`
6. assert migration ceiling `0007_add_license_state.sql` and no verifier before patch
7. apply tests first and prove intended RED
8. apply implementation and prove focused GREEN
9. use Node 22 + `npm ci`
10. run Task 3 crypto tests with `npx tsx --test`
11. run full `npm test`
12. run `npm run lint`
13. run `npm run check:cloudflare-types:master`
14. run Pages build
15. run VPS build
16. generate PREVIEW packages only
17. strict closure audit: 206 entries, byte-identical verifier, migration 0007 only, no crypto test/control-plane/private-key leakage
18. create Master REVIEW ZIP before dependency/build temporary output can contaminate customer packages, or explicitly clean temporary outputs before packaging
19. upload REVIEW artifact with Master + four PREVIEW ZIPs + focused logs + manifest/evidence
20. persist evidence with `customer_ready=false`

- [ ] **Step 4: Independent closure**

Download the resulting artifact and independently verify:

- outer artifact digest matches GitHub metadata
- all five inner ZIP hashes match manifest
- ZIP integrity passes
- Master migration ceiling exactly 0007
- all customer ZIPs exactly 206 entries
- verifier byte-identical across all four plans
- no Task 3 tests, `control-plane/`, `LICENSE_SIGNING_PRIVATE_KEY`, PEM private-key headers, or `0008`
- evidence run/source/artifact lineage is consistent

Only after these checks may Task 3 be called REVIEW-complete.
