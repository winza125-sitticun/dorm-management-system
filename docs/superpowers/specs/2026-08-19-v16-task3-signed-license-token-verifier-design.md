# V16 Task 3 — Signed License Token Contract + Ed25519 Verification Foundation

**Date:** 2026-08-19

**Parent design:** `V16_LICENSE_ACTIVATION_DESIGN.md` dated 2026-08-16.

**Parent implementation:** V16 Task 2 — License State Schema + Installation Bootstrap, Closure V2.

## Goal

Lock the customer-side signed-license token contract and Ed25519 verification foundation before any Control Plane activation API starts issuing tokens. Task 3 adds deterministic canonical serialization, a versioned wire envelope, public-key import, strict token validation, and signature verification. It does not make the token authoritative for plan access yet and does not persist verified tokens into `license_state`.

## Parent-design requirements

The V16 parent design requires:

- a canonical JSON signed-license payload
- Ed25519 signing by the Control Plane private key
- verification in the customer application using an embedded public key through Web Crypto
- no private signing key in the repository, customer package, or environment examples

The payload fields defined by the parent design are:

```json
{
  "v": 1,
  "licenseId": "lic_...",
  "installationId": "uuid",
  "plan": "standard",
  "status": "active",
  "issuedAt": 1786870000,
  "expiresAt": 1789462000,
  "refreshAfter": 1786956400
}
```

Task 3 preserves those field names and meanings exactly.

## Immutable Task 2 baseline

Task 3 must reconstruct its implementation candidate from the clean V16 Task 2 REVIEW V2 artifact only.

- Task 2 closure run: `32200917893`
- Task 2 source SHA: `143b84dc2adc60ece30cf258d9f7987e705c6e90`
- Task 2 artifact ID: `9347482894`
- Task 2 artifact digest: `sha256:fb613ddafa3ed945dc619e498f66132312e37b1c9ea5005ecd7f3cd1e35692de`
- Task 2 Master REVIEW V2 SHA-256: `47fb6f2d7d67f75b6c19ad73943d4157269d7e059608b7730ff0ed455d235e7b`
- Task 2 migration ceiling: `0007_add_license_state.sql`
- Task 2 customer package entry count: `205`
- Task 2 release status: REVIEW; `customer_ready=false`

The earlier Task 2 run/artifact `32200435545` / `9347320043` is BLOCKED and must never be used as a Task 3 baseline.

## Task 3 implementation decisions

The parent design specifies canonical JSON plus an Ed25519 signature but does not define a wire envelope or public-key text encoding. Task 3 therefore fixes those two implementation details so later Control Plane work has one exact contract.

### Signed-token wire format

A V1 token is exactly:

```text
dormlic1.<payload-base64url>.<signature-base64url>
```

Rules:

- exactly three dot-separated segments
- first segment exactly `dormlic1`
- payload segment is unpadded base64url of the UTF-8 canonical JSON bytes
- signature segment is unpadded base64url of the raw Ed25519 signature bytes
- signature input is the raw canonical JSON UTF-8 bytes, not the envelope and not the base64url text
- `=` padding and non-base64url characters are rejected
- decoding must succeed without silently repairing malformed input

### Canonical payload serialization

Canonical V1 JSON uses exactly this key order:

```text
v
licenseId
installationId
plan
status
issuedAt
expiresAt
refreshAfter
```

The canonicalizer must build a new object in that order and serialize it with `JSON.stringify` without whitespace. No optional fields are part of V1.

Example shape:

```ts
JSON.stringify({
  v: payload.v,
  licenseId: payload.licenseId,
  installationId: payload.installationId,
  plan: payload.plan,
  status: payload.status,
  issuedAt: payload.issuedAt,
  expiresAt: payload.expiresAt,
  refreshAfter: payload.refreshAfter,
});
```

During verification, the decoded payload bytes must equal the bytes produced by canonicalizing the parsed payload. This rejects alternate key order, added fields, duplicate-key representations, and non-canonical whitespace before signature verification succeeds as an accepted application token.

### Public-key text representation

Task 3 standardizes publishable Ed25519 public keys as:

```text
SPKI DER bytes -> unpadded base64url string
```

The customer verifier imports them through Web Crypto:

```ts
crypto.subtle.importKey(
  'spki',
  keyBytes,
  { name: 'Ed25519' },
  false,
  ['verify'],
)
```

Task 3 does not embed a production public key. Production key injection belongs to a later integration task. Tests must generate ephemeral Ed25519 key pairs at runtime and must not commit private key material, deterministic private seeds, PEM private keys, or private JWK values.

## Types and module boundary

Keep cryptographic token logic separate from Task 2 D1 persistence logic.

Create:

```text
src/server/services/licenseToken.service.ts
```

Do not merge this logic into `src/server/services/license.service.ts`.

Required public types:

```ts
export type LicenseTokenPlan = 'basic' | 'standard' | 'pro';

export type LicenseTokenStatus =
  | 'active'
  | 'suspended'
  | 'revoked'
  | 'expired';

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
```

Required public functions:

```ts
export function canonicalizeLicenseTokenPayload(
  payload: LicenseTokenPayloadV1,
): string;

export async function importLicensePublicKey(
  spkiBase64Url: string,
): Promise<CryptoKey>;

export async function verifyLicenseToken(
  token: string,
  publicKey: CryptoKey,
  expectedInstallationId: string,
  nowEpochSeconds: number,
): Promise<LicenseTokenPayloadV1>;
```

Helper functions for strict base64url decoding and payload validation may remain private unless a focused test needs a stable exported boundary.

## Validation contract

`verifyLicenseToken` is fail-closed.

It must reject when any of the following is true:

- token envelope does not have exactly three segments
- prefix is not exactly `dormlic1`
- payload or signature base64url contains padding or invalid characters
- payload or signature cannot be decoded
- payload is not valid UTF-8 JSON
- decoded JSON is not an object
- payload contains a field set or byte representation that is not exact canonical V1
- `v !== 1`
- `licenseId` is empty or whitespace-only
- `installationId` is empty or whitespace-only
- `installationId !== expectedInstallationId`
- plan is not `basic`, `standard`, or `pro`
- status is not `active`, `suspended`, `revoked`, or `expired`
- any timestamp is not a finite integer epoch-second number
- timestamp ordering does not satisfy `issuedAt <= refreshAfter <= expiresAt`
- `nowEpochSeconds` is not a finite integer
- `nowEpochSeconds >= expiresAt`
- Ed25519 signature verification returns false or throws

Task 3 does not reject a correctly signed payload merely because its allowed `status` is `suspended`, `revoked`, or `expired`; those states are data for later license-authority/read-only logic. The time-based `expiresAt` boundary is still enforced by the verifier as specified above.

Task 3 does not add a future-issued-token rule because the parent design does not define one.

## Error contract

External callers must receive deterministic error codes without exposing key material or low-level cryptographic details.

Define an error type such as:

```ts
export type LicenseTokenErrorCode =
  | 'LICENSE_TOKEN_INVALID'
  | 'LICENSE_TOKEN_WRONG_INSTALLATION'
  | 'LICENSE_TOKEN_EXPIRED'
  | 'LICENSE_PUBLIC_KEY_INVALID';

export class LicenseTokenError extends Error {
  readonly code: LicenseTokenErrorCode;
}
```

Mapping:

- malformed envelope/payload/canonicalization/timestamps/plan/status/signature failure -> `LICENSE_TOKEN_INVALID`
- installation mismatch -> `LICENSE_TOKEN_WRONG_INSTALLATION`
- `nowEpochSeconds >= expiresAt` -> `LICENSE_TOKEN_EXPIRED`
- malformed/unsupported SPKI key input/import failure -> `LICENSE_PUBLIC_KEY_INVALID`

Error messages must not include token contents, signature bytes, public-key bytes, or raw cryptographic exceptions.

## Verification data flow

The required verifier flow is:

```text
raw token
  -> strict envelope split
  -> strict base64url decode
  -> UTF-8 decode + JSON parse
  -> exact V1 structure/value validation
  -> canonical re-serialization
  -> byte equality with decoded payload
  -> installation binding check
  -> timestamp ordering / expiry boundary
  -> Ed25519 signature verification over canonical payload bytes
  -> return typed LicenseTokenPayloadV1
```

No D1 write occurs in this flow.

## Persistence boundary

Task 2 already added:

```text
license_state.signed_token
license_state.effective_plan
license_state.status
license_state.expires_at
```

Task 3 leaves those fields untouched.

Specifically, Task 3 must not:

- write a verified token into `license_state.signed_token`
- derive or persist `effective_plan`
- change `license_state.status`
- update `last_checked_at`, `grace_until`, or `expires_at`
- call a Control Plane endpoint

The verifier is intentionally pure apart from Web Crypto operations.

## Package and secret boundary

The production verifier module is customer-shippable and must be byte-identical in Demo/Basic/Standard/Pro PREVIEW packages.

Task 3 must preserve Task 1/Task 2 security boundaries:

- `control-plane/` remains excluded from customer packages
- `LICENSE_SIGNING_PRIVATE_KEY` remains forbidden
- no private signing key material may appear in repository patches, Master-generated customer ZIPs, examples, fixtures, snapshots, or logs
- test-only signing helpers/key pairs must remain Master-only
- package audit must reject Task 3 Master-only crypto test files if the generic builder would otherwise ship them

The public-key importer is allowed in customer packages; an actual production public-key value is not introduced in Task 3.

## Migration and compatibility invariants

Task 3 introduces no D1 migration.

Required invariants:

- migration ceiling stays exactly `0007_add_license_state.sql`
- no `0008` migration exists
- `license_state` schema is unchanged
- Task 2 `installation_id` bootstrap behavior is unchanged
- `.dormbackup` continues excluding `license_state`
- Task 1 `requiresLicense` values stay Demo=false, Basic/Standard/Pro=true
- `settings.subscription_plan` remains the current runtime authority during Task 3
- Demo behavior is unchanged
- paid packages are not made read-only in Task 3

## TDD acceptance matrix

Task 3 tests must prove RED against pristine Task 2 REVIEW V2, then GREEN after implementation.

### Canonicalization

- approved payload serializes with the exact V1 key order and no whitespace
- canonical output is deterministic across repeated calls
- canonical payload bytes used for signing equal the bytes later verified

### Valid signatures

Using runtime-generated ephemeral Ed25519 key pairs:

- valid Basic token verifies
- valid Standard token verifies
- valid Pro token verifies
- returned payload exactly matches the signed canonical payload

### Envelope and decoding rejection

- wrong prefix rejects
- missing segment rejects
- extra segment rejects
- empty payload/signature rejects
- padded base64url rejects
- invalid base64url characters reject
- malformed UTF-8/JSON rejects

### Canonical representation rejection

- same semantic JSON with reordered keys rejects
- added unknown field rejects
- whitespace-modified JSON rejects
- duplicate-key/non-canonical representation rejects through canonical byte comparison

### Payload validation rejection

- unsupported version rejects
- empty license ID rejects
- empty installation ID rejects
- unknown plan rejects
- unknown status rejects
- non-integer timestamp rejects
- invalid timestamp ordering rejects
- invalid `nowEpochSeconds` rejects

### Installation binding

- expected installation ID verifies
- token signed for installation A rejects when verified for installation B with `LICENSE_TOKEN_WRONG_INSTALLATION`

### Expiry boundary

- `now = expiresAt - 1` verifies
- `now = expiresAt` rejects with `LICENSE_TOKEN_EXPIRED`
- `now > expiresAt` rejects with `LICENSE_TOKEN_EXPIRED`

### Signature integrity

- one-byte payload tamper rejects
- one-byte signature tamper rejects
- signature from a different Ed25519 key rejects

### Public-key import

- valid runtime-exported Ed25519 SPKI base64url imports and verifies
- malformed SPKI base64url rejects with `LICENSE_PUBLIC_KEY_INVALID`
- structurally invalid SPKI bytes reject with `LICENSE_PUBLIC_KEY_INVALID`

### Package security/parity

All four PREVIEW packages must:

- contain byte-identical `src/server/services/licenseToken.service.ts`
- retain exact migration ceiling `0007_add_license_state.sql`
- contain no migration after `0007`
- preserve Task 1 `requiresLicense` values
- contain no Task 3 Master-only crypto tests/fixtures
- contain no `control-plane/`
- contain no `LICENSE_SIGNING_PRIVATE_KEY` marker
- contain no committed private Ed25519 key material

## Expected implementation files

From the reconstructed Task 2 Master:

- Create: `src/server/services/licenseToken.service.ts`
- Create: `tests/license-token-canonicalization.test.ts`
- Create: `tests/license-token-verification.test.ts`
- Modify: `tests/package-builder.test.mjs` if needed to lock Task 3 Master-only test exclusion
- Modify: `tests/package-audit.test.mjs` if needed to lock Task 3 Master-only test exclusion/private-material rejection
- Modify: `scripts/build-packages.mjs` only if new Task 3 Master-only files would otherwise leak
- Modify: `scripts/package-audit.mjs` only for the minimum Task 3 leakage/private-material boundary required by a failing regression

Branch-side lineage may additionally contain:

- `v16-task3-patches/**`
- `.github/workflows/v16-task3-signed-token-gate.yml`
- `v16-task3-evidence/**`

No migration file is expected.

## CI gate

The Task 3 workflow must reconstruct from immutable Task 2 REVIEW V2 artifact `9347482894`.

Required sequence:

1. checkout Task 3 lineage branch only for spec/plan/patches/workflow/evidence
2. verify exact patch bytes
3. download Task 2 REVIEW V2 artifact `9347482894`
4. verify artifact SHA-256 `fb613ddafa3ed945dc619e498f66132312e37b1c9ea5005ecd7f3cd1e35692de`
5. verify/extract Task 2 Master SHA-256 `47fb6f2d7d67f75b6c19ad73943d4157269d7e059608b7730ff0ed455d235e7b`
6. verify pre-patch migration ceiling exactly `0007_add_license_state.sql`
7. apply Task 3 tests and prove intended RED
8. apply implementation and prove focused GREEN
9. run `npm ci`
10. run Task 3 crypto tests with the project TypeScript toolchain on Node 22
11. run full `npm test`
12. run TypeScript lint
13. run Cloudflare types
14. run Pages production build
15. run VPS production build
16. generate PREVIEW packages only
17. run strict package security/parity closure including byte-identical verifier and no private/test leakage
18. verify migration ceiling remains exactly `0007_add_license_state.sql`
19. create/upload V16 Task 3 REVIEW artifact with exact hashes/evidence
20. persist `customer_ready=false`

Task 3 must not invoke a V16 CUSTOMER-READY release path.

## Explicit non-goals

Task 3 does not:

- create Control Plane source/schema
- create `licenses`, `activations`, or `license_events`
- implement a production private-key signer
- commit or inject a production public key value
- implement `/v1/licenses/activate`, `/refresh`, or `/deactivate`
- implement customer `/api/license/*`
- persist verified tokens
- implement `resolveLicenseState`
- implement `resolveEffectivePlan`
- change `PLAN_ENTITLEMENTS`
- change `settings.subscription_plan` authority
- implement grace-period logic
- implement activation-required/read-only behavior
- implement suspended/revoked/expired UI behavior
- create License Settings UI
- perform dependency vulnerability hardening

## Exit condition

Task 3 is complete in REVIEW status when:

- immutable Task 2 REVIEW V2 Master is reconstructed exactly
- canonical V1 payload serialization is deterministic and exact
- valid Ed25519 tokens verify through Web Crypto
- malformed/non-canonical/tampered/wrong-installation/expired tokens fail with the defined deterministic error contract
- public-key import works with ephemeral runtime Ed25519 SPKI keys
- no private signing material is committed or shipped
- all existing regressions, lint/types/builds, package generation, integrity, and parity gates pass
- all four customer packages contain a byte-identical verifier and retain migration ceiling `0007`
- REVIEW artifact/evidence is reproducible and records `customer_ready=false`

Task 3 output must not be labeled V16 CUSTOMER-READY.