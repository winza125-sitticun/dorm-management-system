# V15 Task 3 — Theme Runtime + Brand Tokens Design

Date: 2026-08-17
Status: Approved design, pending implementation plan
Branch: `agent/v15-task1-white-label-contract`
Source baseline: immutable V15 Task 2 candidate verified by source/release gate `32021078155` and real Cloudflare D1 smoke `32022279921`

## 1. Goal

Build the V15 runtime branding foundation so every application surface can consume one shared branding state and CSS token contract without coupling individual components to the branding API.

Task 3 is intentionally infrastructure-first. It does not add the Settings branding editor or perform a system-wide visual rewrite.

## 2. Scope

Task 3 includes:

- Move the theme/branding runtime to the application root so it covers Login, Main App, Tenant Portal, and LINE Registration.
- Load `GET /api/public/branding` once during application boot.
- Maintain the existing light/dark theme behavior while extending the provider with branding state.
- Derive deterministic brand CSS tokens from the safe public `brandColor`.
- Apply brand tokens to `document.documentElement`.
- Define stable default brand and semantic CSS tokens in the global stylesheet.
- Provide a neutral boot state that prevents a flash from the default brand to the tenant brand.
- Fail open on public-branding network/API failures so the UI still renders with safe defaults.
- Add focused runtime tests and release/package/D1 verification.

## 3. Explicit Out of Scope

Task 3 does not include:

- Settings UI for choosing a brand color.
- Settings UI for uploading/deleting a logo.
- Live branding preview in Settings.
- Client-side logo resize/compression.
- System-wide replacement of every hard-coded green/emerald style.
- Bill/PDF/JPG branding.
- Tenant Portal redesign.
- LINE Registration redesign.
- Animation or advanced theme customization.
- New branding API fields.
- New D1 migrations.
- Changes to the Task 2 public branding security allowlist.

These are separate follow-up tasks.

## 4. Root Architecture

The theme/branding runtime must be mounted before route/surface branching.

Conceptual hierarchy:

```text
ThemeProvider
├── Tenant Portal
├── LINE Registration
└── AuthProvider
    ├── Login
    └── Main App
```

The exact component nesting may follow the existing application structure, but the invariant is strict: all four surfaces must render under the same ThemeProvider instance.

Task 3 must not create separate branding fetches per surface.

## 5. Theme Context Contract

The existing ThemeContext currently owns light/dark mode. Task 3 extends it rather than replacing that behavior.

The context must expose branding state sufficient for consumers without exposing API/network details:

- `dormName: string`
- `brandColor: string`
- `contactPhone: string | null`
- `logoDataUri: string | null`
- `whiteLabelEnabled: boolean`
- `brandingLoading: boolean`
- existing light/dark theme state and actions

The runtime should keep API response parsing and token derivation outside React where practical so they can be unit tested independently.

## 6. Public Branding Boot Flow

At initial application boot:

1. ThemeProvider initializes `brandingLoading=true`.
2. The runtime requests `GET /api/public/branding` once.
3. The request timeout is exactly `3000 ms`. Timeout expiration aborts/abandons the branding request and proceeds immediately to fallback initialization.
4. On a valid paid-plan branding response:
   - validate/normalize the response shape,
   - derive brand tokens from `brandColor`,
   - apply CSS variables to `<html>`,
   - store dorm name, logo, contact phone, and white-label state.
5. On a Demo response (`whiteLabelEnabled=false`):
   - preserve the public dorm identity name,
   - ignore any brand color, logo, or contact override values even if malformed/stale data appears,
   - use default brand tokens,
   - expose `logoDataUri=null` and `contactPhone=null`.
6. On timeout, network failure, non-2xx response, malformed JSON, or invalid response shape:
   - apply safe fallback branding,
   - set `brandingLoading=false`,
   - render the application normally,
   - do not retry automatically during the same provider lifecycle.

The application must remain usable when the public branding endpoint is unavailable.

## 7. Boot Screen and Flicker Prevention

While `brandingLoading=true`, the application must render a lightweight neutral boot surface before any major branded surface is shown.

Requirements:

- Neutral background and progress indicator.
- Must not depend on `--brand-primary` for its main visible appearance.
- Must not render Login/Main/Tenant/LINE surfaces behind it.
- Must disappear after either successful branding initialization or fallback initialization.
- Branding failure must not leave the application on the boot surface indefinitely.

This prevents a visible flash from default `#1DB954` to the tenant brand.

## 8. Default Branding Contract

Default brand color:

`#1DB954`

Fallback branding state:

- `brandColor = #1DB954`
- `logoDataUri = null`
- `contactPhone = null`
- `whiteLabelEnabled = false` when no trustworthy public response is available
- `dormName` must reuse the exact pre-Task-3 fallback product/dorm name already used by the immutable Task 2 candidate; Task 3 must not introduce a new fallback identity string

Task 3 must preserve current default appearance as closely as possible when no white-label branding is available.

## 9. Brand Token Contract

The runtime must define and apply these CSS variables:

- `--brand-primary`
- `--brand-primary-hover`
- `--brand-soft`
- `--brand-contrast`

A pure helper such as `deriveBrandTokens(hex)` must return these values deterministically.

All channel calculations below use integer RGB channels in `[0,255]`, calculate in floating point, then round to the nearest integer and emit uppercase `#RRGGBB`.

### 9.1 `--brand-primary`

The validated normalized `#RRGGBB` color, or `#1DB954` fallback.

### 9.2 `--brand-primary-hover`

Mix the primary color with black using:

`hoverChannel = round(primaryChannel * 0.88)`

This is equivalent to 88% primary + 12% black.

### 9.3 `--brand-soft`

Mix the primary color with white using:

`softChannel = round(primaryChannel * 0.12 + 255 * 0.88)`

This is equivalent to 12% primary + 88% white.

It must not be used as a semantic success/warning/danger color.

### 9.4 `--brand-contrast`

Contrast text is either `#FFFFFF` or `#111111`.

Use the WCAG relative-luminance calculation for the primary color, calculate contrast ratio against both candidate text colors, and choose the candidate with the higher contrast ratio. If the ratios are exactly equal, choose `#111111` as the deterministic tie-breaker.

Tests must include both very dark and very light primary colors.

## 10. Semantic Color Isolation

Brand colors and semantic status colors are separate systems.

Global semantic tokens must exist independently, including:

- `--status-success`
- `--status-warning`
- `--status-danger`
- `--status-info`

Changing `brandColor` must never recalculate or mutate semantic tokens.

Example invariant:

If the tenant chooses red as the brand color, primary actions/brand accents may become red, but paid/success indicators remain success-colored and warning/danger/info retain their own meanings.

Task 3 must include a regression test proving semantic token values are identical across different brand colors.

## 11. Branding Client Boundary

Public branding fetch/parsing should live in a small isolated client/helper rather than directly inside every component.

Responsibilities:

- call `/api/public/branding`,
- enforce the exact `3000 ms` timeout,
- parse and validate the exact Task 2 public response contract,
- enforce Demo masking again on the client as defense in depth,
- return either normalized branding or a typed fallback result,
- never log logo Data URI payloads or private data.

The client must not accept arbitrary CSS from the server.

## 12. Public Response Shape Used by Task 3

Task 3 consumes only the existing Task 2 public fields:

```ts
{
  dormName: string;
  brandColor: string | null;
  contactPhone: string | null;
  logoDataUri: string | null;
  whiteLabelEnabled: boolean;
}
```

Task 3 does not expand this endpoint.

It must not depend on PromptPay, bill footer, LINE, Google, subscription/license private metadata, internal logo storage keys, or authenticated settings fields.

## 13. CSS Usage Scope in Task 3

Task 3 introduces runtime tokens and may convert only a minimal set of identity/primary-action styles needed to prove the runtime works.

Allowed initial brand usage:

- primary action buttons,
- active navigation/accent states,
- focus rings,
- links or identity accents where the change is narrowly scoped and testable.

Task 3 must not perform a broad mechanical conversion of all green/emerald classes across the application.

Semantic status visuals must not be migrated to brand tokens.

## 14. Error Handling

### Public branding timeout/network/API failure

- No fatal error page.
- Use fallback branding.
- Continue rendering the application.
- No automatic retry during the same provider lifecycle.

### Malformed `brandColor`

- Ignore it.
- Use `#1DB954` fallback.

### Malformed logo/contact data

- Treat as `null` rather than passing untrusted values through blindly.

### Demo response with non-null paid branding fields

- Client masks them.
- Default brand tokens remain active.

### DOM/CSS application

- Token application must be centralized.
- Individual surfaces must not directly mutate root brand variables.

## 15. Light/Dark Theme Compatibility

Existing light/dark behavior remains a separate user preference.

Task 3 must preserve:

- existing local-storage behavior for light/dark theme,
- existing toggle behavior,
- existing `dark` class or equivalent root mechanism.

Brand token derivation is independent of the light/dark preference. The same tenant brand primary remains the tenant brand in either mode unless a future task explicitly introduces mode-specific brand palettes.

## 16. Testing Requirements

### 16.1 Pure token tests

Cover at least:

- default `#1DB954`,
- a dark color,
- a light color,
- a red brand,
- normalization behavior,
- malformed/missing input fallback,
- exact 12% black hover formula,
- exact 88% white soft formula,
- WCAG contrast selection and tie-break behavior.

### 16.2 Semantic isolation tests

Prove that changing brand color does not change success/warning/danger/info token constants.

### 16.3 Branding client tests

Cover:

- valid paid branding response,
- Demo response masking,
- exactly `3000 ms` timeout behavior using fake timers or an equivalent deterministic clock,
- HTTP error fallback,
- malformed payload fallback,
- malformed color fallback,
- no automatic retry during one provider lifecycle.

### 16.4 Provider/root tests

Prove that all supported surfaces are under ThemeProvider:

- Login,
- Main App,
- Tenant Portal,
- LINE Registration.

Also verify that only one public branding bootstrap request is initiated per root provider lifecycle under normal production rendering semantics.

### 16.5 Boot/flicker tests

Verify:

- neutral boot state is shown while branding is unresolved,
- application surface renders after success,
- application surface renders after fallback,
- failure cannot leave `brandingLoading=true` permanently.

## 17. Build and Release Gates

Task 3 must pass fresh authoritative gates against the immutable Task 2 baseline plus Task 3 patches:

- focused Task 3 tests,
- relevant regression suite,
- full test suite,
- TypeScript lint,
- Cloudflare type gate,
- production Pages build,
- production VPS build,
- package preview generation,
- package builder/parity tests,
- guarded customer-ready release builder,
- final package/static audit.

One Master remains the source for Demo/Basic/Standard/Pro packages. Generated plan ZIPs must never be patched independently.

## 18. Real Cloudflare Verification

Task 3 is not complete from CI/unit tests alone.

A real Pages + D1 smoke must verify at least Pro and Demo packages from the immutable Task 3 candidate.

The final smoke workflow must use a headless Chromium browser against the deployed stable Pages URLs so DOM/root CSS variables are verified in the actual deployed runtime rather than inferred only from API output or static bundle text. The implementation plan must pin the browser test tooling/version used by CI so the verification is reproducible.

### Pro smoke

Must prove:

- migrations apply successfully with no new Task 3 migration,
- setup and public branding endpoint work,
- custom paid `brandColor` reaches the runtime,
- deployed browser reaches the intended application surface after boot,
- `getComputedStyle(document.documentElement)` reports the expected `--brand-primary`, `--brand-primary-hover`, `--brand-soft`, and `--brand-contrast` values,
- semantic token values remain unchanged while a non-default brand is active,
- logo/contact public values are present in context/runtime without exposing private fields,
- existing backup/restore baseline remains healthy enough to detect major runtime/package regression.

Fallback behavior must also be proven deterministically in automated tests; the real smoke may use an interceptable browser request or an explicit test-only harness path if the implementation plan can do so without changing the production public API contract.

### Demo smoke

Must prove:

- first setup dorm name remains available,
- `whiteLabelEnabled=false`,
- default brand `#1DB954` is applied,
- logo/contact paid overrides are not consumed,
- deployed browser completes boot successfully,
- root CSS brand tokens match the default-derived token set.

All temporary Cloudflare Pages and D1 resources must be cleaned up even when smoke assertions fail.

## 19. Package/Plan Invariants

Task 3 does not change plan entitlements.

White-label entitlement remains:

- Demo: disabled
- Basic: enabled
- Standard: enabled
- Pro: enabled

PromptPay entitlements remain unchanged from prior tasks.

Task 3 must not change backup format or schema versions.

## 20. Security and Privacy

- Branding boot uses only `/api/public/branding`.
- No authenticated Settings endpoint should be called merely to render public/login surfaces.
- No PromptPay, LINE, Google OAuth, license metadata, backup token, user role, or credential data is allowed into branding context.
- Logo Data URI must never be printed in logs.
- No arbitrary CSS, remote stylesheet, script, SVG, or HTML injection is accepted by Theme Runtime.

## 21. Acceptance Criteria

Task 3 is complete only when all of the following are true:

1. ThemeProvider covers Login, Main App, Tenant Portal, and LINE Registration.
2. Public branding is fetched once during normal root boot.
3. Branding boot timeout is exactly `3000 ms`.
4. Network/API/malformed failures render the app with safe defaults and no automatic retry loop.
5. Neutral boot state prevents default-brand-to-tenant-brand visual flash.
6. `#1DB954` remains the default brand.
7. `--brand-primary`, `--brand-primary-hover`, `--brand-soft`, and `--brand-contrast` are defined and applied centrally.
8. Hover is exactly 88% primary + 12% black using rounded RGB channels.
9. Soft is exactly 12% primary + 88% white using rounded RGB channels.
10. Contrast uses WCAG relative luminance and chooses the better of `#FFFFFF` and `#111111`.
11. Semantic success/warning/danger/info colors remain independent from the brand color.
12. Demo masks color/logo/contact overrides and retains setup dorm name.
13. Existing light/dark theme behavior remains functional.
14. No new D1 migration is introduced.
15. No Task 2 public API field expansion is introduced.
16. No Settings branding editor is introduced in Task 3.
17. One Master package generation remains intact for all four plans.
18. Fresh tests, lint, types, Pages build, VPS build, package/release gates pass.
19. Real Pro + Demo Cloudflare Pages/D1 smoke passes with headless-browser verification of root CSS tokens.
20. Temporary Cloudflare resources are cleaned up on success and failure.
21. Completion is recorded only after source/release evidence and real deployment evidence are available.

## 22. Follow-up Boundary

After Task 3, the intended next V15 work item is the Settings White-label UI/live-preview integration that consumes this runtime foundation. Bill/PDF/JPG branding and broad surface styling remain separate follow-up work so they can be tested independently.
