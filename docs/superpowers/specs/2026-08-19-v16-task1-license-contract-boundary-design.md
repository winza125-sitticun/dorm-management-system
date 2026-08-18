# V16 Task 1 — License Contract + Vendor Boundary Gate Design

**Date:** 2026-08-19

**Approved parent design:** `V16_LICENSE_ACTIVATION_DESIGN.md` dated 2026-08-16.

## Goal

Introduce the package-level license contract and vendor-only source boundary required by V16 without changing customer runtime behavior, plan authority, database schema, or the frozen V15 CUSTOMER-READY bytes.

## Immutable baseline

Task 1 must be built only from GitHub Actions artifact `9330679827` (`v15-customer-ready-final`).

- Outer artifact SHA-256: `5f6e65ae856c1196fcd3a2e3dd7bcffb4da863ab212d3595839e921f0a96e1cf`
- Master V15 SHA-256: `d05ee110815a29b74498e17adac1b8355dec40d5a705dd016f5ad5f849caa9e9`
- Required migration ceiling before and after Task 1: `0006_add_white_label_settings.sql`
- Blocked artifact `9326820971` must never be used as a source.
- V15 CUSTOMER-READY ZIPs are immutable and are not regenerated or modified by this task.

## Scope

Task 1 makes only four classes of change to the extracted V15 Master candidate:

1. Add a strict `requiresLicense` boolean to every `package-plans/*.json` contract.
2. Make the package builder reject a plan when `requiresLicense` is missing or not a boolean.
3. Reserve `control-plane/` as a vendor-only root that customer package generation and package audit must exclude/reject.
4. Add regression tests proving the plan contract, vendor boundary, and private signing material policy.

Task 1 does not create the Control Plane implementation itself. The reserved directory boundary is established before any signing code or signing secret is introduced.

## Plan contract

The exact required values are:

```text
demo     requiresLicense=false
basic    requiresLicense=true
standard requiresLicense=true
pro      requiresLicense=true
```

`loadPlans()` in `scripts/build-packages.mjs` must fail closed for malformed plan metadata. The accepted type is JSON boolean only; strings such as `"true"`, numbers, null, or omitted properties are invalid.

This field is metadata only in Task 1. It must not change `settings.subscription_plan`, `PLAN_ENTITLEMENTS`, feature gates, API authorization, setup behavior, mutation behavior, or Demo behavior.

## Vendor boundary

`control-plane/` is reserved for vendor-only V16 source and must never be present in a customer ZIP.

Builder behavior:

- `scripts/build-packages.mjs` excludes every path under `control-plane/` while staging Demo, Basic, Standard, or Pro packages.
- The exclusion is prefix-based so future files such as `control-plane/src/index.ts`, `control-plane/migrations/*`, tests, local configs, and package metadata are covered without adding each file individually.

Audit behavior:

- `scripts/package-audit.mjs` treats any `control-plane/` entry as forbidden customer content.
- Audit fails if a constructed/test package contains any path under that root.

The Master may contain `control-plane/` in later V16 tasks. Customer packages may not.

## Private signing material policy

The V16 parent design requires the Ed25519 private signing key to exist only as the Control Plane secret `LICENSE_SIGNING_PRIVATE_KEY`; customer packages receive public verification material only in later tasks.

Task 1 establishes a leak gate before that secret exists in source:

- Customer package audit must fail when text content contains the exact private-secret identifier `LICENSE_SIGNING_PRIVATE_KEY` outside an explicitly vendor-only root.
- Tests must prove that a synthetic signing-secret marker in customer-staged content is rejected.
- No private signing key, seed, PEM/private JWK, or usable signing material is added by Task 1.

This gate is intentionally narrow: the identifier is forbidden in customer package text while the future `control-plane/` root is excluded before customer auditing.

## Files expected to change

From the extracted immutable V15 Master candidate:

- `package-plans/demo.json`
- `package-plans/basic.json`
- `package-plans/standard.json`
- `package-plans/pro.json`
- `scripts/build-packages.mjs`
- `scripts/package-audit.mjs`
- `tests/package-builder.test.mjs`
- `tests/package-audit.test.mjs`
- `tests/package-release.test.mjs` only if the existing release-level parity assertions need an explicit `control-plane/` regression

Branch-side CI/patch lineage may additionally create:

- `v16-task1-patches/**`
- `.github/workflows/v16-task1-license-contract-gate.yml`
- `v16-task1-evidence/**`

No `d1-migrations/0007_*` file is allowed in Task 1.

## TDD acceptance tests

### Plan contract

Tests must first fail against the unmodified V15 baseline and then pass after implementation:

- all four plans expose `requiresLicense`
- exact values are false/true/true/true for Demo/Basic/Standard/Pro
- a temporary plan missing `requiresLicense` is rejected by `loadPlans()`
- a temporary plan with `requiresLicense: "true"` is rejected
- valid boolean values are accepted

### Vendor boundary

- a synthetic `control-plane/vendor-only-marker.txt` present in a Master fixture is absent from every generated customer ZIP
- package audit rejects a ZIP/file list containing `control-plane/vendor-only-marker.txt`
- normal existing Master-only exclusions remain green

### Secret leak gate

- package audit rejects customer text containing `LICENSE_SIGNING_PRIVATE_KEY`
- normal customer text without the marker remains accepted
- no V15 customer package is modified to include signing material

### Release/package regression

After implementation:

- `node --check scripts/build-packages.mjs` passes
- `node --check scripts/package-audit.mjs` passes
- focused builder/audit tests pass
- full native builder test group passes
- Preview generation succeeds for Demo/Basic/Standard/Pro
- every generated Preview ZIP passes integrity verification
- package parity remains green except for expected plan-specific injected metadata already supported by the V15 builder
- no customer ZIP contains `package-plans/`, `docs/superpowers/`, `control-plane/`, Master builder internals, active Cloudflare config, `.env`, `.dev.vars`, or private signing material
- latest D1 migration remains exactly `0006_add_white_label_settings.sql`

## CI lineage gate

The V16 Task 1 workflow must reconstruct its candidate from the immutable V15 artifact rather than from `main` or from the historical V13 ZIP.

Required workflow sequence:

1. Download artifact `9330679827`.
2. Verify outer SHA-256 exactly.
3. Extract and verify `dorm-management-system-master-v15-CUSTOMER-READY.zip` SHA-256 exactly.
4. Verify migration ceiling `0006_add_white_label_settings.sql`.
5. Apply versioned Task 1 tests first and prove the intended RED state where practical.
6. Apply implementation patches.
7. Run focused tests and native builder regression.
8. Run dependency-backed release checks available in GitHub Actions without creating a V16 CUSTOMER-READY release.
9. Generate V16 Task 1 REVIEW/PREVIEW candidate artifacts only.
10. Upload hashes and evidence tied to the workflow source SHA.

The task is not V16 CUSTOMER-READY. Full V16 release status is deferred until the complete License/Activation subsystem passes the V16 exit gate: signed-token verification, activation-count enforcement, offline grace/read-only behavior, and private-key leak audit.

## Security and compatibility invariants

- Business data remains in customer D1.
- Control Plane stores only license/release metadata in later tasks.
- No vendor private signing key is allowed in customer ZIPs.
- Backup availability under invalid license is not changed by Task 1.
- Expired/revoked behavior is not implemented by Task 1.
- Demo remains usable without activation because no runtime license enforcement exists yet.
- All four customer packages continue to derive from one Master.
- Existing V14 Backup/Restore and V15 White-label behavior must remain unchanged.

## Explicit non-goals

Task 1 does not:

- add `license_state`
- add migration `0007`
- create activation/refresh/deactivate APIs
- create an Ed25519 signer or verifier
- embed a public key
- create `resolveLicenseState`, `resolveEffectivePlan`, or mutation read-only gates
- modify `settings.subscription_plan` authority
- create License Settings UI
- create Control Plane database schema or deployment
- change paid-package runtime behavior
- perform dependency vulnerability hardening

## Exit condition

Task 1 is complete when the immutable V15 Master can be reconstructed, the new license metadata contract is strictly validated, `control-plane/` and the private signing secret identifier are proven unable to leak into customer packages, all relevant regressions are green, migration ceiling remains `0006`, and the workflow uploads a reproducible V16 Task 1 REVIEW candidate with exact hashes and evidence. It must not label any output V16 CUSTOMER-READY.