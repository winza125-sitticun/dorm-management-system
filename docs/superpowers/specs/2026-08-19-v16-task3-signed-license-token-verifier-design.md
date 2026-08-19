# V16 Task 3 — Signed License Token Contract + Ed25519 Verification Foundation

**Date:** 2026-08-19

**Parent design:** `V16_LICENSE_ACTIVATION_DESIGN.md` dated 2026-08-16.

**Parent implementation:** V16 Task 2 — License State Schema + Installation Bootstrap, Closure V2.

## Goal

Lock the customer-side signed-license token contract and Ed25519 verification foundation before any Control Plane activation API starts issuing tokens. Task 3 adds deterministic canonical serialization, a versioned wire envelope, public-key import, strict token validation, and signature verification. It does not make the token authoritative for plan access and does not persist verified tokens into `license_state`.

## Parent-design requirements

The V16 parent design requires:

- a canonical JSON signed-license payload
- Ed25519 signing by the Control Plane private key
- verification in the customer application using an embedded public key through Web Crypto
- no private signing key in the repository, customer package, or environment examples

The parent payload is exactly:

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

Task 3 must reconstruct its candidate from the clean V16 Task 2 REVIEW V2 artifact only:

- closure run: `32200917893`
- source SHA: `143b84dc2adc60ece30cf258d9f7987e705c6e90`
- artifact ID: `9347482894`
- artifact SHA-256: `fb613ddafa3ed945dc619e498f66132312e37b1c9ea5005ecd7f3cd1e35692de`
- Master SHA-256: `47fb6f2d7d67f75b6c19ad73943d4157269d7e059608b7730ff0ed455d235e7b`
- migration ceiling: `0007_add_license_state.sql`
- customer package entry count: `205`
- release status: REVIEW; `customer_ready=false`

Blocked Task 2 run/artifact `32200435545` / `9347320043` must never be used as a Task 3 baseline.

## Task 3 implementation decisions

The parent design defines canonical JSON plus an Ed25519 signature but does not define the wire envelope or text encoding of the publishable public key. Task 3 fixes those details so later Control Plane work has one exact contract.

### Signed-token wire format

A V1 token is exactly:

```text
dormlic1.<payload-base64url>.<signature-base64url>
```

Rules:

- exactly three dot-separated segments
- prefix exactly `dormlic1`
- payload segment is unpadded base64url of UTF-8 canonical JSON bytes
- signature segment is unpadded base64url of raw Ed25519 signature bytes
- signature input is the raw canonical JSON UTF-8 bytes, not the envelope or base64url text
- `=` padding and non-base64url characters are rejected
- decoding must fail rather than silently repair malformed input

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

The canonicalizer constructs a new object in that order and serializes it with `JSON.stringify` and no whitespace:

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

During verification, decoded payload bytes must equal the bytes produced by canonicalizing the parsed payload. This rejects alternate key order, unknown fields, duplicate-key representations, and non-canonical whitespace.

### Public-key text representation

Task 3 standardizes publishable Ed25519 public keys as:

```text
SPKI DER bytes -> unpadded base64url string
```

Customer code imports them through Web Crypto:

```ts
crypto.subtle.importKey(
  'spki',
  keyBytes,
  { name: 'Ed25519' },
  false,
  ['verify'],
)
```

Task 3 does not embed a production public-key value. Production key injection belongs to a later integration task.

### Dependency policy

Task 3 uses platform Web Crypto only. It must not add JWT, JOSE, sodium, noble, tweetnacl, or any other runtime cryptography dependency, and must not modify `package.json`/`package-lock.json` solely for token verification.

Tests generate ephemeral Ed25519 key pairs at runtime and must not commit private key material, deterministic private seeds, PEM private keys, or private JWK values.

## Module boundary

Create a customer-shippable crypto module separate from Task 2 persistence logic:

```text
src/server/services/licenseToken.service.ts
```

Do not merge crypto logic into `src/server/services/license.service.ts`.

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

Strict base64url and payload-validation helpers remain private unless a focused test needs a stable exported boundary.

## Validation contract

`verifyLicenseToken` is fail-closed. It rejects when any of these is true:

- envelope does not have exactly three segments
- prefix is not exactly `dormlic1`
- payload/signature base64url contains padding or invalid characters
- payload/signature cannot be decoded
- payload is not valid UTF-8 JSON
- decoded JSON is not an object
- field set or byte representation is not exact canonical V1
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

A correctly signed token is not rejected merely because its allowed status is `suspended`, `revoked`, or `expired`; later authority/read-only logic interprets those states. The time-based `expiresAt` boundary is still enforced here.

Task 3 does not add a future-issued-token rule because the parent design does not define one.

## Error contract

External callers receive deterministic codes without key/token leakage:

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
- malformed/unsupported SPKI input/import failure -> `LICENSE_PUBLIC_KEY_INVALID`

Messages must not include token contents, signature bytes, public-key bytes, or raw crypto exceptions.

## Verification data flow

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
  -> typed LicenseTokenPayloadV1
```

No D1 write occurs.

## Persistence boundary

Task 2 already added `license_state.signed_token`, `effective_plan`, `status`, `expires_at`, and related timestamps. Task 3 leaves them untouched.

Task 3 must not:

- write a token into `license_state.signed_token`
- derive/persist `effective_plan`
- change `license_state.status`
- update `last_checked_at`, `grace_until`, or `expires_at`
- call a Control Plane endpoint

## Package and secret boundary

The production verifier is customer-shippable and must be byte-identical in Demo/Basic/Standard/Pro PREVIEW packages.

Task 3 adds exactly one customer-shippable file relative to Task 2: `src/server/services/licenseToken.service.ts`. Therefore the expected customer ZIP entry count is exactly **206** for every plan: Task 2 baseline 205 + one verifier file.

Task 3 crypto tests are Master-only and must be explicitly excluded by both builder and package audit. The current packaging model uses explicit Master-only test lists, so this is a required change, not optional.

Required boundaries:

- `control-plane/` remains excluded
- `LICENSE_SIGNING_PRIVATE_KEY` remains forbidden
- no private signing key material appears in patches, generated customer ZIPs, examples, fixtures, snapshots, or logs
- Task 3 Master-only tests/fixtures never ship
- package audit rejects those Task 3 Master-only paths if injected into customer staging
- actual production public-key value is absent in Task 3
- all four customer ZIPs contain exactly 206 entries

## Migration and compatibility invariants

Task 3 introduces no D1 migration.

Required invariants:

- migration ceiling remains exactly `0007_add_license_state.sql`
- no `0008` migration exists
- `license_state` schema is unchanged
- Task 2 `installation_id` bootstrap is unchanged
- `.dormbackup` continues excluding `license_state`
- Task 1 `requiresLicense` values remain Demo=false, Basic/Standard/Pro=true
- `settings.subscription_plan` remains current runtime authority during Task 3
- Demo behavior is unchanged
- paid packages are not made read-only

## TDD acceptance matrix

Tests must prove RED against pristine Task 2 REVIEW V2 and GREEN after implementation.

### Canonicalization

- approved payload serializes in exact V1 key order with no whitespace
- output is deterministic
- bytes signed equal bytes verified

### Valid signatures

Using runtime-generated ephemeral Ed25519 key pairs:

- valid Basic verifies
- valid Standard verifies
- valid Pro verifies
- returned payload exactly matches signed canonical payload

### Envelope/decoding rejection

- wrong prefix
- missing/extra segment
- empty payload/signature
- padded base64url
- invalid base64url characters
- malformed UTF-8/JSON

### Canonical representation rejection

- reordered keys
- unknown field
- whitespace-modified JSON
- duplicate-key/non-canonical representation

### Payload validation rejection

- unsupported version
- empty license ID
- empty installation ID
- unknown plan
- unknown status
- non-integer timestamp
- invalid timestamp ordering
- invalid `nowEpochSeconds`

### Installation binding

- expected installation verifies
- token for installation A verified as B -> `LICENSE_TOKEN_WRONG_INSTALLATION`

### Expiry boundary

- `now = expiresAt - 1` verifies
- `now = expiresAt` -> `LICENSE_TOKEN_EXPIRED`
- `now > expiresAt` -> `LICENSE_TOKEN_EXPIRED`

### Signature integrity

- payload tamper rejects
- signature tamper rejects
- different signing key rejects

### Public-key import

- runtime-exported valid Ed25519 SPKI base64url imports/verifies
- malformed base64url -> `LICENSE_PUBLIC_KEY_INVALID`
- invalid SPKI bytes -> `LICENSE_PUBLIC_KEY_INVALID`

### Package security/parity

All four PREVIEW packages must:

- contain byte-identical `licenseToken.service.ts`
- contain exactly 206 entries
- retain migration ceiling `0007_add_license_state.sql`
- contain no migration after `0007`
- preserve Task 1 `requiresLicense` values
- contain no Task 3 Master-only tests/fixtures
- contain no `control-plane/`
- contain no `LICENSE_SIGNING_PRIVATE_KEY`
- contain no committed private Ed25519 key material

## Expected implementation files

From reconstructed Task 2 Master:

- Create: `src/server/services/licenseToken.service.ts`
- Create: `tests/license-token-canonicalization.test.ts`
- Create: `tests/license-token-verification.test.ts`
- Modify: `tests/package-builder.test.mjs` to lock Task 3 Master-only exclusion and exact customer count/parity intent
- Modify: `tests/package-audit.test.mjs` to reject Task 3 Master-only test leakage/private signing material
- Modify: `scripts/build-packages.mjs` to exclude the two Task 3 Master-only test files
- Modify: `scripts/package-audit.mjs` to reject the same Task 3 Master-only paths and preserve secret boundaries

No migration file and no runtime dependency changes are expected.

Branch-side lineage may also contain:

- `v16-task3-patches/**`
- `.github/workflows/v16-task3-signed-token-gate.yml`
- `v16-task3-evidence/**`

## CI gate

Task 3 workflow reconstructs from immutable Task 2 REVIEW V2 artifact `9347482894`.

Required sequence:

1. checkout Task 3 lineage branch for spec/plan/patches/workflow/evidence only
2. verify exact patch bytes
3. download Task 2 REVIEW V2 artifact `9347482894`
4. verify artifact SHA-256 `fb613ddafa3ed945dc619e498f66132312e37b1c9ea5005ecd7f3cd1e35692de`
5. verify/extract Task 2 Master SHA-256 `47fb6f2d7d67f75b6c19ad73943d4157269d7e059608b7730ff0ed455d235e7b`
6. verify migration ceiling exactly `0007_add_license_state.sql`
7. apply Task 3 tests and prove intended RED
8. apply implementation and prove focused GREEN
9. run `npm ci`
10. run Task 3 crypto tests with project TypeScript toolchain on Node 22
11. run full `npm test`
12. run TypeScript lint
13. run Cloudflare types
14. run Pages production build
15. run VPS production build
16. generate PREVIEW packages only
17. strict customer-package closure: exact 206 entries, byte-identical verifier, no Master-only/private/control-plane leakage
18. verify migration ceiling remains exactly `0007_add_license_state.sql`
19. create/upload V16 Task 3 REVIEW artifact with exact hashes/evidence
20. persist `customer_ready=false`

Task 3 must not invoke a V16 CUSTOMER-READY release path.

## Explicit non-goals

Task 3 does not:

- create Control Plane source/schema
- create `licenses`, `activations`, or `license_events`
- implement production private-key signing
- commit/inject a production public-key value
- implement `/v1/licenses/activate`, `/refresh`, or `/deactivate`
- implement customer `/api/license/*`
- persist verified tokens
- implement `resolveLicenseState` or `resolveEffectivePlan`
- change `PLAN_ENTITLEMENTS`
- change `settings.subscription_plan` authority
- implement grace period or read-only enforcement
- create License Settings UI
- perform dependency vulnerability hardening

## Exit condition

Task 3 is complete in REVIEW status when:

- immutable Task 2 REVIEW V2 Master is reconstructed exactly
- canonical V1 serialization is deterministic/exact
- valid Ed25519 tokens verify through Web Crypto
- malformed/non-canonical/tampered/wrong-installation/expired tokens fail with deterministic error codes
- public-key import works with ephemeral runtime Ed25519 SPKI keys
- no private signing material is committed or shipped
- all regressions, lint/types/builds, package generation, integrity, and parity gates pass
- all four customer packages contain byte-identical verifier, exactly 206 entries, and migration ceiling `0007`
- REVIEW artifact/evidence is reproducible and records `customer_ready=false`

Task 3 output must not be labeled V16 CUSTOMER-READY.