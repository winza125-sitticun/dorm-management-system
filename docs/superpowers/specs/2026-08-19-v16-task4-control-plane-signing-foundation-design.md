# V16 Task 4 — Vendor Control Plane Schema + Ed25519 Signing Foundation

**Date:** 2026-08-19

**Parent design:** `V16_LICENSE_ACTIVATION_DESIGN.md` dated 2026-08-16.

**Parent implementation:** V16 Task 3 — Signed License Token Contract + Ed25519 Verification Foundation.

## Goal

Create the first real vendor-only Dorm Control Plane package inside the Master repository. Task 4 establishes the Control Plane D1 schema, Worker package boundary, Ed25519 private-key import/signing implementation, and a cross-contract test proving that tokens produced by the vendor signer are accepted by the Task 3 customer verifier.

Task 4 intentionally does not implement license-key activation, refresh, deactivation, seat counting, customer license APIs, token persistence, effective-plan authority, grace/read-only enforcement, or production deployment.

## Parent-design requirements

The V16 parent design requires a Dorm Control Plane Worker backed by its own License D1 and an Ed25519 signing private key held only as a Control Plane secret. Customer packages contain only public verification material and must never contain Control Plane source or private signing material.

The parent design defines three Control Plane tables:

- `licenses`
- `activations`
- `license_events`

It also requires that license keys are hashed at rest, raw license keys are not logged, signed tokens use canonical serialization, and `control-plane/` is excluded from every customer ZIP.

## Immutable Task 3 baseline

Task 4 must reconstruct its candidate from the clean V16 Task 3 REVIEW artifact only:

- Task 3 gate run: `32205296206`
- Task 3 source SHA: `4faa47601b1e855bc027311abfa8e7d4ed1f8739`
- Task 3 artifact ID: `9348923137`
- Task 3 artifact SHA-256: `98382e591e5c9c5027026011ccac6d66702ed18c576603060e7860d66313c682`
- Task 3 Master REVIEW SHA-256: `c4f6eeed671b96e99f54fcd71504e16ad1b268014636f2d5f57eb4289f3e51c7`
- Task 3 customer migration ceiling: `0007_add_license_state.sql`
- Task 3 customer package entry count: `206`
- Task 3 verifier SHA-256: `2b2a0144ba6b01ed9f9bfbf16d7df1d4a7ed2fcc5655e6c2c2fb43d53ff76180`
- Task 3 release status: REVIEW; `customer_ready=false`

Task 4 must not use `main`, V13, an older Task 2 artifact, or mutable customer source as its product baseline.

## Architectural boundary

Task 4 creates a vendor-only sibling package:

```text
control-plane/
├─ src/
│  ├─ index.ts
│  └─ signing.ts
├─ migrations/
│  └─ 0001_license_schema.sql
├─ tests/
│  ├─ schema.test.ts
│  ├─ signing.test.ts
│  └─ customer-contract.test.ts
├─ package.json
├─ package-lock.json
├─ tsconfig.json
└─ wrangler.template.jsonc
```

The package is deployable independently from the customer application. It must not depend on customer D1 bindings, customer auth secrets, rooms, tenants, bills, LINE settings, PromptPay data, or any other customer business-data table.

The Master repository may contain `control-plane/`; Demo/Basic/Standard/Pro packages must never contain it.

## Control Plane D1 schema

Create exactly one vendor migration:

```text
control-plane/migrations/0001_license_schema.sql
```

This migration belongs only to the vendor Control Plane. It must not be copied into `d1-migrations/`, must not change the customer migration ceiling, and must not create customer-side tables.

### `licenses`

Required SQL contract:

```sql
CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  customer_label TEXT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('basic', 'standard', 'pro')),
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended', 'revoked', 'expired')),
  max_activations INTEGER NOT NULL DEFAULT 1 CHECK(max_activations >= 1),
  expires_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Task 4 does not define the license-key generation algorithm or hash algorithm. `key_hash` is an opaque storage field for Task 5 service logic. No plaintext `license_key`, `raw_key`, or equivalent column may exist.

### `activations`

Required SQL contract:

```sql
CREATE TABLE activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  project_name TEXT NULL,
  primary_hostname TEXT NULL,
  activated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT NULL,
  UNIQUE(license_id, installation_id)
);

CREATE INDEX idx_activations_license_revoked
  ON activations(license_id, revoked_at);
```

The index exists to support later active-seat lookup without defining Task 5 seat-counting behavior in Task 4.

Task 4 does not add cascade-delete semantics. License and activation lifecycle mutation rules belong to Task 5 service logic.

### `license_events`

Required SQL contract:

```sql
CREATE TABLE license_events (
  id INTEGER PRIMARY KEY,
  license_id TEXT NULL,
  installation_id TEXT NULL,
  kind TEXT NOT NULL,
  ip_hash TEXT NULL,
  user_agent_hash TEXT NULL,
  created_at TEXT NOT NULL
);
```

The event table must not contain request-body, raw license-key, signed-token, IP-address, or raw user-agent columns.

### Migration behavior

Applying `0001_license_schema.sql` to an empty Control Plane D1 must:

- create exactly the three application tables above, plus Wrangler's own migration bookkeeping where applicable
- create `idx_activations_license_revoked`
- leave all three application tables empty
- reject duplicate `licenses.key_hash`
- reject plans outside `basic|standard|pro`
- reject statuses outside `active|suspended|revoked|expired`
- reject `max_activations < 1`
- reject duplicate `(license_id, installation_id)` activation pairs

Task 4 introduces no seed license and no vendor/customer fixture data into the migration.

## Signing contract

Task 3 already locked the customer token wire format:

```text
dormlic1.<payload-base64url>.<signature-base64url>
```

and exact canonical V1 payload field order:

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

Task 4 must produce byte-compatible tokens with that contract.

### Private-key representation

Task 4 standardizes the Control Plane signing secret as:

```text
Ed25519 PKCS#8 DER bytes -> unpadded base64url -> LICENSE_SIGNING_PRIVATE_KEY
```

The production secret value is never committed.

Required import behavior:

```ts
crypto.subtle.importKey(
  'pkcs8',
  privateKeyBytes,
  { name: 'Ed25519' },
  false,
  ['sign'],
)
```

The repository may contain the environment-variable identifier `LICENSE_SIGNING_PRIVATE_KEY` inside vendor-only source/config documentation, but no real private key, seed, PEM private key, PKCS#8 fixture, or private JWK value may be committed.

### Signing module

Create:

```text
control-plane/src/signing.ts
```

Required types:

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

export async function importLicenseSigningPrivateKey(
  pkcs8Base64Url: string,
): Promise<CryptoKey>;

export async function signLicenseToken(
  payload: LicenseTokenPayloadV1,
  privateKey: CryptoKey,
): Promise<string>;
```

The Control Plane canonicalizer must build a new object in the exact Task 3 key order and serialize it using `JSON.stringify` without whitespace.

`signLicenseToken` signs the raw UTF-8 canonical JSON bytes and returns an unpadded base64url envelope with prefix exactly `dormlic1`.

### Signer validation

The signer must fail closed before signing if:

- `v !== 1`
- `licenseId` or `installationId` is empty/whitespace-only
- plan is outside `basic|standard|pro`
- status is outside `active|suspended|revoked|expired`
- any timestamp is not a finite integer
- timestamp ordering is not `issuedAt <= refreshAfter <= expiresAt`

Task 4 does not apply `now >= expiresAt` policy while signing; Task 5 determines when a license is eligible to receive a token. Task 3 customer verification continues to enforce token expiry.

Required deterministic error codes:

```ts
export type LicenseSigningErrorCode =
  | 'LICENSE_SIGNING_PAYLOAD_INVALID'
  | 'LICENSE_SIGNING_PRIVATE_KEY_INVALID';
```

Raw key bytes and underlying cryptographic exception text must not appear in error messages.

## Cross-contract verification

Task 4 must prove that the vendor signer and Task 3 customer verifier share one protocol rather than merely having similar code.

Required test flow:

```text
generate ephemeral Ed25519 key pair
  -> export private key as PKCS#8
  -> encode private key as unpadded base64url
  -> import through Control Plane importLicenseSigningPrivateKey()
  -> sign Basic/Standard/Pro payloads through signLicenseToken()
  -> export public key as SPKI
  -> encode public key as unpadded base64url
  -> import through Task 3 importLicensePublicKey()
  -> verify through Task 3 verifyLicenseToken()
  -> returned payload must exactly equal signed payload
```

Tests must also prove:

- Control Plane canonical bytes exactly equal Task 3 canonical bytes for the same payload
- tampered payload is rejected by Task 3 verifier
- tampered signature is rejected
- a token signed by key A is rejected by public key B
- invalid PKCS#8 input returns `LICENSE_SIGNING_PRIVATE_KEY_INVALID`

Ephemeral keys must be generated at test runtime only. No deterministic private seed or private-key fixture is permitted.

## Worker shell

Create:

```text
control-plane/src/index.ts
```

Task 4 Worker shell must expose no license business API yet.

Required behavior:

- every `/v1/licenses/*` request returns HTTP 404
- no activation, refresh, deactivation, key lookup, seat counting, event writing, or token issuance occurs in `index.ts`
- no customer endpoint exists under `control-plane/`

The Worker environment contract reserves:

```ts
export interface Env {
  LICENSE_DB: D1Database;
  LICENSE_SIGNING_PRIVATE_KEY: string;
}
```

Task 4 may type these bindings but must not use the signing secret in a live route.

## Wrangler template

Create `control-plane/wrangler.template.jsonc` for vendor deployment configuration only.

Required properties:

- Worker entrypoint: `src/index.ts`
- D1 binding name: `LICENSE_DB`
- database name placeholder exactly `dorm-license-control-plane-placeholder`
- database ID placeholder exactly `00000000-0000-0000-0000-000000000000`
- `migrations_dir`: `migrations`
- no production database ID
- no private key under `vars`
- no active `.dev.vars`, `.env`, or secret value

The all-zero UUID is a syntactically valid non-production placeholder only. Production provisioning must replace it outside the Task 4 source artifact. CI may generate a temporary runtime Wrangler config from the template when needed, but must not commit a provisioned resource ID.

The private key must be supplied as a Cloudflare Worker secret outside source control in a later deployment task.

## Control Plane package boundary

`control-plane/package.json` is a standalone vendor package. Keep dependencies minimal and Node 22 compatible.

Required scripts must support:

- focused tests
- TypeScript typecheck
- Wrangler/local D1 migration smoke used by CI

Task 4 must not introduce a web framework solely for future APIs. Native Worker `Request`/`Response` handling is sufficient for the 404 shell.

## Existing package-builder regression hazard

Task 3 Master contains a test named:

```text
builder excludes the vendor-only control-plane root from customer staging
```

That test currently creates `control-plane/` at the real repository root and deletes the entire directory recursively in `finally`. This was safe only while no real Control Plane source existed.

Task 4 must change this regression before or atomically with creation of the real vendor package so that tests can never delete vendor source.

The replacement test must use this safety pattern:

1. record whether the repository-root `control-plane/` directory existed before the test
2. create the directory only if it did not already exist
3. write one uniquely named test marker file inside that directory
4. run the builder and prove the marker is absent from customer staging
5. in `finally`, delete only the marker file
6. remove the `control-plane/` directory only when the test itself created it and the directory is still empty
7. never call recursive `rm` on a pre-existing `control-plane/` directory

This keeps the regression meaningful against pristine Task 3, where the directory does not yet exist, while becoming non-destructive once Task 4 creates real vendor source.

The existing customer audit regression that creates `control-plane/` under a temporary customer-tree root is already isolated and may remain conceptually unchanged.

## Customer package immutability

Task 4 is vendor-side only. Customer product bytes are not supposed to change.

For Demo/Basic/Standard/Pro PREVIEW packages, Task 4 closure must prove:

- exact entry count remains `206`
- customer migration ceiling remains exactly `0007_add_license_state.sql`
- no `0008` migration exists
- `src/server/services/licenseToken.service.ts` remains byte-identical to Task 3 verifier SHA-256 `2b2a0144ba6b01ed9f9bfbf16d7df1d4a7ed2fcc5655e6c2c2fb43d53ff76180`
- `control-plane/` is absent
- Control Plane tests are absent
- `LICENSE_SIGNING_PRIVATE_KEY` marker is absent
- no PKCS#8/private Ed25519 material is present
- Task 1 `requiresLicense` remains Demo=false, Basic/Standard/Pro=true
- `license_state` schema/backup exclusion remains unchanged

Because root Master-only tests may change, byte-for-byte outer customer ZIP equality is not required. Instead, compare a normalized path+content SHA-256 manifest of every customer-package entry against the corresponding Task 3 PREVIEW package. The normalized manifests must match exactly for each plan.

## TDD acceptance matrix

Task 4 tests must prove RED against pristine Task 3 REVIEW Master, then GREEN after implementation.

### Package-builder safety

- the old recursive real-root cleanup is removed
- the safe marker-file pattern above cannot delete a pre-existing vendor directory
- builder excludes the marker and actual nested vendor tree from customer staging
- audit rejects a forced customer tree containing `control-plane/`

### Schema

- migration creates `licenses`, `activations`, `license_events`
- all columns/nullability/defaults are exact
- `licenses.key_hash` is unique
- no plaintext license-key column exists
- plan CHECK rejects unsupported values
- status CHECK rejects unsupported values
- `max_activations=0` rejects
- default `max_activations=1`
- duplicate `(license_id, installation_id)` rejects
- `idx_activations_license_revoked` exists
- fresh migration leaves application row counts at zero

### Signing

- valid runtime-exported Ed25519 PKCS#8 base64url imports
- malformed base64url rejects
- structurally invalid PKCS#8 rejects
- canonical payload order is exact and deterministic
- valid Basic token is signed and accepted by Task 3 verifier
- valid Standard token is signed and accepted
- valid Pro token is signed and accepted
- invalid version/plan/status/IDs/timestamps reject before signing
- wrong key rejects during Task 3 verification
- tampered payload/signature rejects during Task 3 verification

### Worker shell

- `/v1/licenses/activate` returns 404
- `/v1/licenses/refresh` returns 404
- `/v1/licenses/deactivate` returns 404
- no handler imports or invokes later Task 5 license business service

### Secret/package isolation

- no committed private key/seed/private JWK/PEM/PKCS#8 fixture
- vendor source may reference the secret name but customer packages may not
- all four customer packages retain exact normalized Task 3 content manifests

## Expected implementation files

Create:

- `control-plane/src/index.ts`
- `control-plane/src/signing.ts`
- `control-plane/migrations/0001_license_schema.sql`
- `control-plane/tests/schema.test.ts`
- `control-plane/tests/signing.test.ts`
- `control-plane/tests/customer-contract.test.ts`
- `control-plane/package.json`
- `control-plane/package-lock.json`
- `control-plane/tsconfig.json`
- `control-plane/wrangler.template.jsonc`

Modify only as needed:

- `tests/package-builder.test.mjs` to remove destructive real-root fixture behavior
- `tests/package-audit.test.mjs` for stronger vendor-secret/private-material regression if a RED test requires it
- `scripts/build-packages.mjs` only if the existing `control-plane/` prefix exclusion is insufficient
- `scripts/package-audit.mjs` only if a failing regression proves a missing customer-leak boundary

Branch-side lineage may additionally contain:

- `v16-task4-patches/**`
- `.github/workflows/v16-task4-control-plane-signing-gate.yml`
- `v16-task4-evidence/**`

Task 4 must not create a customer `0008` migration.

## CI gate

The Task 4 workflow must reconstruct from immutable Task 3 REVIEW artifact `9348923137`.

Required sequence:

1. checkout Task 4 lineage branch for spec/plan/patches/workflow/evidence only
2. reconstruct and verify exact Task 4 patch bytes
3. download Task 3 REVIEW artifact `9348923137`
4. verify outer SHA-256 `98382e591e5c9c5027026011ccac6d66702ed18c576603060e7860d66313c682`
5. verify/extract Task 3 Master SHA-256 `c4f6eeed671b96e99f54fcd71504e16ad1b268014636f2d5f57eb4289f3e51c7`
6. capture normalized Task 3 customer PREVIEW manifests for Demo/Basic/Standard/Pro
7. verify customer migration ceiling exactly `0007_add_license_state.sql`
8. apply Task 4 tests and prove intended RED
9. apply Task 4 implementation and prove focused GREEN
10. run fresh root dependency install
11. run root full regression suite/lint/Cloudflare types/Pages build/VPS build
12. run fresh `control-plane` dependency install
13. run Control Plane schema/signing/cross-contract/worker tests
14. run Control Plane TypeScript typecheck
15. run local D1 migration smoke against `control-plane/migrations/0001_license_schema.sql`
16. generate root PREVIEW customer packages only
17. compare all four normalized customer path+content manifests exactly to Task 3 PREVIEW baselines
18. run strict customer package audit for vendor/private/test leakage
19. verify customer migration ceiling remains exactly `0007_add_license_state.sql`
20. upload a V16 Task 4 REVIEW artifact containing Master, four PREVIEW customer packages, Control Plane schema/signing evidence, and SHA manifest
21. persist `customer_ready=false`

Task 4 must not deploy a production Control Plane and must not invoke a V16 CUSTOMER-READY release path.

## Explicit non-goals

Task 4 does not:

- generate or provision real license keys
- define the license-key hash algorithm
- implement `control-plane/src/license.service.ts`
- implement license lookup/status/expiry service behavior
- count active seats
- implement rate limiting
- implement `POST /v1/licenses/activate`
- implement `POST /v1/licenses/refresh`
- implement `POST /v1/licenses/deactivate`
- issue tokens from a public HTTP route
- write activation/event rows through application logic
- implement operator/admin APIs or CLI
- deploy a production Control Plane Worker or D1
- create a production signing key
- inject the customer public key/control-plane URL
- implement customer `/api/license/*`
- persist `license_state.signed_token`
- implement `resolveEffectivePlan`
- implement grace-period/read-only behavior
- create License Settings UI
- alter customer D1 schema or business data

## Exit condition

Task 4 is complete in REVIEW status when:

- immutable Task 3 REVIEW Master is reconstructed exactly
- the vendor Control Plane package exists only under `control-plane/`
- `0001_license_schema.sql` passes fresh local D1 schema/constraint tests
- the Ed25519 signer imports runtime PKCS#8 and emits exact Task 3-compatible tokens
- cross-contract tests prove Task 3 verifier accepts Task 4 Basic/Standard/Pro tokens
- all `/v1/licenses/*` routes remain 404
- no real private signing material exists in repository or artifacts
- all four customer normalized content manifests remain exactly equal to Task 3
- customer migration ceiling remains `0007`
- REVIEW artifact/evidence is reproducible and records `customer_ready=false`

Task 4 output must not be labeled V16 CUSTOMER-READY.