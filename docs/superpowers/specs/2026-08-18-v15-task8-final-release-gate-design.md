# V15 Task 8 — Final Integration / Acceptance Matrix / Release Gate

วันที่: 2026-08-18
สถานะ: Written spec for user review
Branch: `agent/v15-task1-white-label-contract`
ฐาน release candidate: V15 Task 7 immutable candidate artifact `9317174783`
Task 7 candidate digest: `sha256:2f475ac6daaae661442b3cb13b60b8d4ed82c74570c2e67ed70a8242bbbf0d3e`
Task 7 Production Gate: run `32117229708` = PASS
Task 7 Cloudflare Portal Smoke: run `32117658608` = PASS

## 1. Goal

Task 8 is the final V15 release gate. It does not add a new White-label feature. It proves that the completed V15 implementation can be released as one coherent, reproducible, customer-ready build across Demo, Basic, Standard, and Pro without silently changing product bytes during the gate.

The gate must produce evidence sufficient to decide one of exactly two outcomes:

- `V15 CUSTOMER-READY`: every required acceptance, regression, package, security, migration, integrity, and Cloudflare smoke gate passed from the same immutable source lineage.
- `V15 BLOCKED`: at least one required gate failed. In this case Task 8 must not relabel or promote any candidate to CUSTOMER-READY. Product defects are fixed in a separate explicit fix cycle and the final gate is rerun from a new immutable candidate.

## 2. Immutable Source Rule

Task 8 starts from the exact Task 7 candidate artifact:

- artifact ID: `9317174783`
- digest: `sha256:2f475ac6daaae661442b3cb13b60b8d4ed82c74570c2e67ed70a8242bbbf0d3e`

The Task 8 workflow must verify the artifact digest and the Task 7 Master/package hashes before running release tests.

Task 8 must not patch product source code during the release gate. It may add release-only tests, manifests, workflows, evidence files, and release metadata outside the customer product source. If a focused acceptance test exposes a product defect, the release gate stops and reports `BLOCKED`.

## 3. Acceptance Matrix

The final gate must explicitly record PASS/FAIL for all of the following V15 acceptance requirements.

### AC-01 — Cross-surface dorm identity

The same effective runtime `dormName` must appear consistently in:

- Login
- authenticated desktop app shell
- authenticated mobile app shell
- Bill preview
- Print/PDF path
- JPG path
- Tenant Portal lookup
- active Tenant Portal

### AC-02 — Logo parity and fallback

When White-label is effective and a valid logo exists, the same logo identity must be available on the required V15 surfaces. Missing or broken logo must fall back without crashing the application or exports.

Demo must not expose dormant paid logo identity.

### AC-03 — Brand color without semantic-color corruption

Brand-facing surfaces must use the effective brand color, including custom red and dark brand cases, while semantic status colors remain semantic and independent of brand color.

At minimum the focused matrix must cover:

- default brand `#1DB954`
- custom brand
- red brand
- dark brand / contrast behavior

### AC-04 — Brand color validation

White-label brand color accepts canonical `#RRGGBB` values and rejects malformed HEX values. Canonical stored/output color remains uppercase where the existing V15 contract requires it.

### AC-05 — Logo validation

The release matrix must prove existing logo validation behavior for:

- supported PNG
- supported JPEG
- supported WebP
- SVG rejection
- payload larger than 300 KB rejection

The gate must not weaken or bypass the existing logo API validation.

### AC-06 — Public branding secret boundary

`/api/public/branding` must expose only the public branding projection and must not expose PromptPay account data, LINE secrets/tokens, Google credentials, JWT secrets, license secrets, or other private integration credentials.

### AC-07 — Public branding failure fallback

If the public branding request fails, the application must leave the branding boot state and render with safe default branding rather than hanging indefinitely or crashing.

### AC-08 — Default compatibility

An installation that does not configure paid White-label fields must preserve the expected default visual identity and usable application behavior. No migration backfill may force a different customer brand.

### AC-09 — Plan entitlement matrix

The release gate must verify the V15 White-label entitlement matrix:

| Plan | whiteLabel |
|---|---|
| Demo | false |
| Basic | true |
| Standard | true |
| Pro | true |

Demo may set the initial dorm name during setup bootstrap but must not gain paid White-label mutation/effective branding after setup. Basic/Standard/Pro must retain the approved White-label capability. Existing PromptPay entitlement semantics remain independent and unchanged.

### AC-10 — Reset-to-default

Resetting/clearing optional White-label values must result in safe fallback behavior: default brand color, no logo identity when no logo is configured, and no stale paid footer/contact identity where values are cleared or masked.

## 4. Focused Runtime Test Matrix

Task 8 adds release-only acceptance tests against the immutable Task 7 Master/package contents. The focused matrix must verify the acceptance requirements that are not fully represented by a single previous task gate.

Required matrix dimensions:

- brand: default, custom, red, dark
- logo: PNG, JPEG, WebP, missing, broken
- invalid logo: SVG, >300 KB
- public branding: success and endpoint failure fallback
- plans: Demo, Basic, Standard, Pro
- reset/clear behavior
- surfaces: Login, App shell, Bill, Tenant Portal

Tests must preserve the existing semantic status palette contract and must verify migration ceiling `0006_add_white_label_settings.sql`.

## 5. Full Release Verification

The immutable Task 7 Master must pass a fresh release build and regression run:

1. `npm ci`
2. focused Task 8 acceptance tests
3. complete existing `npm test`
4. lint
5. Cloudflare type checks
6. Pages production build
7. VPS production build
8. Master Builder generation
9. package builder/release tests
10. package-level tests for Demo, Basic, Standard, Pro
11. migration verification for all four plans
12. One Master/package parity audit
13. secret audit
14. ZIP integrity verification

No package may contain `node_modules`, temporary credentials, private signing material, Cloudflare API tokens, JWT secret values, owner test credentials, or release-smoke fixtures containing real credentials.

## 6. One Master and Package Parity

Task 8 must regenerate the four release packages from one verified V15 Master lineage rather than independently editing package ZIPs.

The release audit must compare all White-label product source files and tests that are expected to be identical across plans. Plan-specific differences must be generated only by the approved Master Builder/package entitlement mechanism.

The highest migration in Master and every generated plan package must remain:

`0006_add_white_label_settings.sql`

Task 8 must not add a schema migration or API contract change.

## 7. CUSTOMER-READY Artifact Promotion

Only after every pre-release gate is green, Task 8 may materialize final archives named as V15 CUSTOMER-READY outputs.

Required release outputs:

- V15 Master archive
- Demo CUSTOMER-READY ZIP
- Basic CUSTOMER-READY ZIP
- Standard CUSTOMER-READY ZIP
- Pro CUSTOMER-READY ZIP
- SHA-256 manifest covering every final archive
- Task 8 acceptance/evidence manifest

Promotion is a controlled copy/materialization from verified Task 8 output. A failed candidate must never be renamed to CUSTOMER-READY.

## 8. Real Cloudflare Final Smoke

The final runtime gate must deploy exact CUSTOMER-READY package bytes to temporary Cloudflare Pages/D1 resources and verify at least Pro and Demo, representing both sides of the White-label entitlement boundary.

### Pro smoke

Verify real setup/authentication plus:

- public branding projection
- Login branding
- desktop shell branding
- mobile shell branding
- Bill preview branding
- JPG export generation
- Print/PDF branding path
- Tenant Portal lookup branding
- active Tenant Portal branding
- valid logo behavior
- broken/missing logo fallback

### Demo smoke

Seed dormant paid branding values in storage, then verify effective runtime masking:

- default fallback brand `#1DB954`
- no paid logo leak
- no paid footer/contact leak on Bill
- Login/App/Portal/Bill use effective Demo branding
- exports complete successfully

The smoke must use real D1/API data, not a fake product page.

All temporary Pages projects and D1 databases must be deleted, and cleanup evidence must show exit code `0` for every resource.

Basic and Standard do not require duplicate Cloudflare deployments if their package/runtime entitlement and parity checks pass in the full four-plan matrix. If those checks expose plan-specific differences beyond approved entitlements, the final gate is blocked.

## 9. Security and Secret Audit

The release gate must scan the Master and every final package for credential-bearing material and forbidden release artifacts.

At minimum verify:

- no Cloudflare API token values
- no JWT secret values used by smoke deployments
- no test account passwords/tokens
- no private signing/vendor credentials
- no `.env` secrets bundled unintentionally
- public branding response boundary remains public-only

A secret audit finding is release-blocking.

## 10. Evidence and Reproducibility

Task 8 must persist exact identifiers for:

- source branch SHA
- source Task 7 artifact ID/digest
- Production/Acceptance Gate run ID
- final CUSTOMER-READY artifact ID/digest
- Master SHA-256
- Demo/Basic/Standard/Pro SHA-256
- Cloudflare final smoke run ID/attempt
- Cloudflare smoke evidence artifact ID/digest
- cleanup evidence
- acceptance matrix PASS/FAIL per AC-01 through AC-10

The evidence must be written to `V15_TASK8_STATUS_TH.md` and supporting `v15-task8-evidence/` pointer files.

## 11. Release Decision

Task 8 may mark V15 `CUSTOMER-READY` only when all of these are true in fresh evidence from the same release lineage:

- AC-01..AC-10 all PASS
- full tests PASS
- lint PASS
- Cloudflare types PASS
- Pages/VPS builds PASS
- all four package gates PASS
- all four migration checks PASS
- parity PASS
- secret audit PASS
- ZIP integrity PASS
- Pro final Cloudflare smoke PASS
- Demo final Cloudflare smoke PASS
- cleanup PASS

If any item is false or missing, the status remains `V15 BLOCKED` and Task 8 must identify the exact failed gate.

## 12. Out of Scope

Task 8 does not:

- start V16 License/Activation work
- add migration `0007` or later
- add a new White-label capability
- change PromptPay entitlement semantics
- merge `main` automatically
- deploy a permanent customer environment

A successful Task 8 means the V15 release artifacts are verified CUSTOMER-READY and ready for an explicit merge/release decision; it does not itself authorize unrelated V16 work.