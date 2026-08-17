# V15 Task 3 — Theme Runtime + Brand Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one root-level Theme + Branding Runtime that loads the existing safe public branding contract once at boot, derives deterministic CSS brand tokens, preserves semantic status colors and light/dark behavior, and covers Login, Main App, Tenant Portal, and LINE Registration.

**Architecture:** Keep the immutable V15 Task 2 candidate as the source baseline and apply Task 3 as byte-exact candidate patches rather than editing the stale repository-root application. Split runtime behavior into pure token derivation, a small public-branding client, React context/application, and root boot gating. Source/package gates create one immutable Master candidate; a separate real Pages + D1 smoke uses headless Chromium to verify actual DOM CSS variables for Pro and Demo.

**Tech Stack:** React 18, TypeScript, Vite, Vitest/tsx-based existing test harness, Tailwind/global CSS, Cloudflare Pages Functions + D1, Express/VPS build parity, GitHub Actions, headless Chromium in CI smoke.

## Global Constraints

- Source baseline is the immutable V15 Task 2 candidate from source/release run `32021078155`, artifact `v15-task2-candidate-pending-d1-smoke`, artifact ID `9285398323`.
- Do not implement Task 3 against the stale repository-root application source.
- Task 3 adds **no D1 migration** and **no public-branding API fields**.
- `GET /api/public/branding` remains the only branding boot data source.
- Public response shape remains exactly `{ dormName, brandColor, contactPhone, logoDataUri, whiteLabelEnabled }`.
- Public branding boot timeout is exactly `3000 ms`.
- Default brand color is exactly `#1DB954`.
- `--brand-primary-hover` is channel-wise `round(primaryChannel * 0.88)`.
- `--brand-soft` is channel-wise `round(primaryChannel * 0.12 + 255 * 0.88)`.
- `--brand-contrast` is either `#FFFFFF` or `#111111`, selected by WCAG relative-luminance contrast ratio; choose the higher ratio and choose `#111111` on an exact tie.
- Semantic success/warning/danger/info values are constants and never derive from `brandColor`.
- Demo keeps the setup dorm name but masks `brandColor`, `logoDataUri`, and `contactPhone` and uses default brand tokens.
- Existing light/dark local-storage and root-class behavior must remain unchanged.
- Task 3 does not add Settings branding UI, logo upload UI, live preview, bill/PDF/JPG branding, Tenant Portal redesign, LINE Registration redesign, or a broad green/emerald rewrite.
- One Master remains the source for Demo/Basic/Standard/Pro. Never patch generated plan ZIPs independently.
- Real deployment verification must use stable `<project>.pages.dev` URLs, not hash-prefixed preview URLs.
- Real deployment verification must inspect actual DOM/computed root CSS variables using headless Chromium.
- No logo Data URI or private credential material may be written to logs/evidence.
- Completion requires both source/package gate PASS and real Pro + Demo Cloudflare Pages/D1/browser smoke PASS with cleanup evidence.

---

## File Structure Map

Task 3 should produce these focused candidate-source units:

- `src/theme/brandTheme.ts` — pure color normalization, deterministic brand-token derivation, semantic-token constants, and CSS-variable application helper.
- `src/theme/brandingClient.ts` — exact public-branding response normalization, Demo masking, 3000 ms timeout, and safe fallback result.
- `src/context/ThemeContext.tsx` — preserve light/dark behavior; bootstrap branding once; expose normalized branding state; apply root tokens centrally.
- `src/components/BrandingBootScreen.tsx` — neutral unbranded startup surface used only while branding is unresolved.
- `src/App.tsx` — move ThemeProvider above all surface branching and place one boot gate around Login/Main/Tenant/LINE surfaces.
- `src/index.css` — default brand variables and independent semantic variables; minimal identity/action token consumption only.

Focused candidate tests:

- `tests/brand-theme-runtime.test.ts`
- `tests/branding-client-runtime.test.ts`
- `tests/theme-root-runtime.test.ts`
- `tests/theme-css-contract.test.ts`

Repository-side execution/evidence files:

- `.github/workflows/v15-task3-tdd.yml`
- `.github/workflows/v15-task3-production-gate.yml`
- `.github/workflows/v15-task3-d1-smoke.yml`
- `.github/scripts/v15_task3_d1_smoke.py`
- `.github/scripts/v15_task3_browser_smoke.mjs`
- `V15_TASK3_STATUS_TH.md` only after all final gates pass.

The exact candidate patch transport should mirror Task 2: reconstruct the immutable baseline in CI, verify source SHA before patching, apply only reviewed Task 3 patches, and generate a new immutable candidate only after all source gates pass.

---

### Task 1: Pure Brand Token Contract

**Files:**
- Create: `src/theme/brandTheme.ts`
- Create: `tests/brand-theme-runtime.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEFAULT_BRAND_COLOR = '#1DB954' as const;

  export type BrandTokens = {
    primary: string;
    hover: string;
    soft: string;
    contrast: '#FFFFFF' | '#111111';
  };

  export const SEMANTIC_STATUS_TOKENS: Readonly<{
    success: string;
    warning: string;
    danger: string;
    info: string;
  }>;

  export function normalizeBrandColor(input: unknown): string;
  export function deriveBrandTokens(input: unknown): BrandTokens;
  export function applyBrandTokens(root: Pick<CSSStyleDeclaration, 'setProperty'>, tokens: BrandTokens): void;
  ```
- Consumers: Task 2 branding client, Task 3 ThemeContext, CSS-contract tests, browser smoke expected-token calculation.

- [ ] **Step 1: Write failing deterministic token tests**

  Test exact cases, not only relationships:

  ```ts
  expect(deriveBrandTokens('#000000')).toEqual({
    primary: '#000000',
    hover: '#000000',
    soft: '#E0E0E0',
    contrast: '#FFFFFF',
  });

  expect(deriveBrandTokens('#FFFFFF')).toEqual({
    primary: '#FFFFFF',
    hover: '#E0E0E0',
    soft: '#FFFFFF',
    contrast: '#111111',
  });

  expect(deriveBrandTokens('#ff0000').primary).toBe('#FF0000');
  expect(deriveBrandTokens(null).primary).toBe('#1DB954');
  expect(deriveBrandTokens('red').primary).toBe('#1DB954');
  ```

  Add assertions that two different brand colors leave `SEMANTIC_STATUS_TOKENS` byte-identical.

- [ ] **Step 2: Run focused test and require RED**

  Run the candidate's focused test command against only `tests/brand-theme-runtime.test.ts` using the existing Task 2 test runner convention.

  Expected: FAIL because `src/theme/brandTheme.ts` does not exist.

- [ ] **Step 3: Implement strict `#RRGGBB` normalization**

  `normalizeBrandColor()` must trim only for the input check, accept exactly `/^#[0-9A-Fa-f]{6}$/`, return uppercase, and return `DEFAULT_BRAND_COLOR` for every other input. Do not accept short hex, rgb(), hsl(), named colors, CSS variables, or arbitrary CSS.

- [ ] **Step 4: Implement fixed channel math**

  For each RGB channel `c`:

  ```ts
  const hover = Math.round(c * 0.88);
  const soft = Math.round(c * 0.12 + 255 * 0.88);
  ```

  Convert outputs to uppercase two-digit hex.

- [ ] **Step 5: Implement WCAG contrast choice**

  Convert sRGB channel `v/255` to linear form:

  ```ts
  const linear = x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  ```

  Compare the primary against `#FFFFFF` and `#111111`; return the higher-contrast text color, with `#111111` on a numeric tie.

- [ ] **Step 6: Define independent semantic constants**

  Use the candidate's current semantic meanings/default palette as constants. Do not derive these constants from `DEFAULT_BRAND_COLOR` and do not alias `success` to `brand-primary`.

- [ ] **Step 7: Implement centralized CSS-variable application**

  `applyBrandTokens()` sets only:

  ```text
  --brand-primary
  --brand-primary-hover
  --brand-soft
  --brand-contrast
  ```

  It must not mutate semantic variables.

- [ ] **Step 8: Run focused tests to GREEN and run diff check**

  Require 0 failures and `git diff --check` clean in the isolated candidate workspace.

- [ ] **Step 9: Commit Task 1 candidate patches/tests**

  Store byte-exact test and production patches using the same immutable-candidate CI transport convention as Task 2. Commit message:

  `feat(v15-task3): add deterministic brand token contract`

---

### Task 2: Public Branding Client + 3000 ms Fallback

**Files:**
- Create: `src/theme/brandingClient.ts`
- Create: `tests/branding-client-runtime.test.ts`
- Modify only if necessary for shared exported types: no API/server files.

**Interfaces:**
- Consumes: `DEFAULT_BRAND_COLOR`, `normalizeBrandColor` from Task 1.
- Produces:
  ```ts
  export type RuntimeBranding = {
    dormName: string;
    brandColor: string;
    contactPhone: string | null;
    logoDataUri: string | null;
    whiteLabelEnabled: boolean;
    source: 'public' | 'fallback';
  };

  export const BRANDING_TIMEOUT_MS = 3000 as const;
  export function fallbackBranding(dormName?: string): RuntimeBranding;
  export function normalizePublicBranding(input: unknown): RuntimeBranding;
  export async function fetchPublicBranding(options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }): Promise<RuntimeBranding>;
  ```
- Consumers: ThemeContext and tests.

- [ ] **Step 1: Write RED tests for paid, Demo, malformed, HTTP error, and timeout**

  Paid example:

  ```ts
  expect(normalizePublicBranding({
    dormName: 'Blue Dorm',
    brandColor: '#123456',
    contactPhone: '081-234-5678',
    logoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
    whiteLabelEnabled: true,
  })).toMatchObject({
    dormName: 'Blue Dorm',
    brandColor: '#123456',
    contactPhone: '081-234-5678',
    whiteLabelEnabled: true,
    source: 'public',
  });
  ```

  Demo example must become:

  ```ts
  {
    dormName: 'Demo Dorm',
    brandColor: '#1DB954',
    contactPhone: null,
    logoDataUri: null,
    whiteLabelEnabled: false,
    source: 'public'
  }
  ```

  Add fake-fetch tests proving one request only and fallback on non-2xx, rejected promise, malformed JSON/shape, and a never-resolving request bounded by timeout.

- [ ] **Step 2: Run focused test and require RED**

  Expected: missing client module/functions.

- [ ] **Step 3: Implement exact response allowlist parsing**

  `normalizePublicBranding()` must read only the five Task 2 public fields. It must not spread the source object into runtime state.

  Rules:
  - `dormName`: trimmed non-empty string, max 120; otherwise use existing candidate fallback dorm/product name.
  - `brandColor`: `normalizeBrandColor()` only when `whiteLabelEnabled === true`; otherwise default.
  - `contactPhone`: trimmed string length 1..32 for paid plan, else null.
  - `logoDataUri`: only a string beginning exactly with `data:image/png;base64,`, `data:image/jpeg;base64,`, or `data:image/webp;base64,`; otherwise null. Do not decode/log it here.
  - `whiteLabelEnabled`: true only for literal boolean `true`.

- [ ] **Step 4: Implement timeout without retry loops**

  Use one `AbortController` and one timer of exactly `BRANDING_TIMEOUT_MS=3000` by default. Clear the timer in `finally`. Any fetch/HTTP/parse/timeout failure returns `fallbackBranding()` and does not throw to the application boot path.

  `fetchPublicBranding()` must make exactly one normal request per call to `/api/public/branding`, with `Accept: application/json` and no authentication header.

- [ ] **Step 5: Prove no sensitive/public-contract expansion**

  Seed an input object containing PromptPay, LINE, Google, subscription/license, internal logo-key, token/password-looking sentinels and assert none appear in `JSON.stringify(normalizePublicBranding(...))`.

- [ ] **Step 6: Run focused tests GREEN**

  Require paid/Demo/error/timeout/leak assertions all pass.

- [ ] **Step 7: Commit Task 2 patches/tests**

  `feat(v15-task3): add public branding boot client`

---

### Task 3: Extend ThemeContext into Theme + Branding Runtime

**Files:**
- Modify: `src/context/ThemeContext.tsx`
- Create: focused context/runtime assertions in `tests/theme-root-runtime.test.ts`

**Interfaces:**
- Consumes: `fetchPublicBranding`, `RuntimeBranding`, `deriveBrandTokens`, `applyBrandTokens`.
- Produces existing light/dark API unchanged plus:
  ```ts
  dormName: string;
  brandColor: string;
  contactPhone: string | null;
  logoDataUri: string | null;
  whiteLabelEnabled: boolean;
  brandingLoading: boolean;
  ```

- [ ] **Step 1: Capture existing light/dark contract in regression tests**

  Before implementation, add assertions around the candidate's existing storage key (`app_theme`), initial class behavior, and toggle function names. Do not rename the existing public context API merely for Task 3.

- [ ] **Step 2: Add RED branding-context source/runtime assertions**

  Assert ThemeContext imports one branding client, initializes loading state true, and has one boot effect scoped to provider lifecycle. Add a testable helper boundary if React DOM test utilities are unavailable rather than adding a broad UI testing dependency.

- [ ] **Step 3: Add normalized branding state to provider**

  Initialize from `fallbackBranding()` with `brandingLoading=true`. On mount, call `fetchPublicBranding()` once. On resolution, derive/apply tokens first, update branding state, then finish loading.

  Guard state writes after unmount with a local `cancelled` flag. Fetch cancellation remains owned by the client timeout; do not add retry intervals.

- [ ] **Step 4: Preserve light/dark effect independently**

  Keep existing localStorage and `dark` root class behavior in its own effect/path. Branding color changes must not overwrite or depend on `theme`.

- [ ] **Step 5: Centralize token application**

  ThemeContext is the only React runtime component allowed to call `applyBrandTokens(document.documentElement.style, ...)` in Task 3. Individual Login/Main/Tenant/LINE components must not set root brand variables.

- [ ] **Step 6: Ensure fallback always clears loading**

  Because the client returns a fallback result instead of throwing, the provider must reach `brandingLoading=false` for paid success, Demo success, timeout, HTTP error, and malformed response.

- [ ] **Step 7: Run context/light-dark regression tests GREEN**

  Require no changes to existing theme behavior and no additional public API/network calls.

- [ ] **Step 8: Commit Task 3 patches/tests**

  `feat(v15-task3): bootstrap branding in theme context`

---

### Task 4: Root Provider Coverage + Neutral Boot Gate

**Files:**
- Create: `src/components/BrandingBootScreen.tsx`
- Modify: `src/App.tsx`
- Extend: `tests/theme-root-runtime.test.ts`

**Interfaces:**
- Consumes: ThemeProvider/context `brandingLoading`.
- Produces one provider instance covering all four surfaces.

- [ ] **Step 1: Write RED root-coverage assertions**

  Assert source/component structure has the invariant:

  ```text
  ThemeProvider
  ├─ Tenant Portal
  ├─ LINE Registration
  └─ AuthProvider → Login/Main App
  ```

  Explicitly fail if TenantPortalView or LineRegisterView is returned before ThemeProvider.

- [ ] **Step 2: Write RED boot-gate assertions**

  Assert unresolved branding renders `BrandingBootScreen` instead of branded application surfaces, and resolved branding renders the normal surface tree.

- [ ] **Step 3: Implement neutral boot screen**

  Use neutral classes/colors only. It must not reference `var(--brand-primary)`, `bg-emerald-*`, the tenant logo, or a customer brand color. Give the top-level element stable test hooks:

  ```tsx
  <div data-branding-boot="loading" aria-busy="true" aria-live="polite">...</div>
  ```

  Keep copy generic and short; do not invent a new product brand.

- [ ] **Step 4: Move ThemeProvider above all route branching**

  Refactor `src/App.tsx` minimally. If useful, extract the existing branch logic into an internal `AppSurface` component, then export/root-render:

  ```tsx
  <ThemeProvider>
    <BrandingBootGate>
      <AppSurface />
    </BrandingBootGate>
  </ThemeProvider>
  ```

  `BrandingBootGate` may be a small local component or focused exported component, but it must read `brandingLoading` from the one root context.

- [ ] **Step 5: Preserve AuthProvider semantics**

  Tenant Portal and LINE Registration remain public surfaces and must not accidentally become dependent on authenticated user state. AuthProvider should continue wrapping only the branch(es) that already need it.

- [ ] **Step 6: Run root/boot tests GREEN**

  Prove all four surfaces are underneath ThemeProvider and the boot screen cannot persist after success/fallback state resolution.

- [ ] **Step 7: Commit Task 4 patches/tests**

  `feat(v15-task3): move branding runtime to app root`

---

### Task 5: CSS Token Defaults + Minimal Brand Consumption

**Files:**
- Modify: `src/index.css`
- Create/extend: `tests/theme-css-contract.test.ts`
- Modify only narrowly scoped identity/action classes/components if required to demonstrate tokens; list every such file in the Task 5 commit before implementation.

**Interfaces:**
- Consumes root CSS variables from Task 1/ThemeContext.
- Produces stable default CSS variables even before JavaScript applies tenant branding.

- [ ] **Step 1: Write RED CSS contract tests**

  Parse/read `src/index.css` and assert these variables exist in the global root scope:

  ```css
  --brand-primary: #1DB954;
  --brand-primary-hover: <exact derived default>;
  --brand-soft: <exact derived default>;
  --brand-contrast: <exact WCAG-selected value>;
  --status-success: ...;
  --status-warning: ...;
  --status-danger: ...;
  --status-info: ...;
  ```

  Assert semantic declarations do not reference any `--brand-*` variable.

- [ ] **Step 2: Add root defaults matching `deriveBrandTokens('#1DB954')` exactly**

  Compute expected values from Task 1 test fixture and write those literal defaults into CSS. Do not hand-pick visually similar values.

- [ ] **Step 3: Add semantic variables using current semantic palette**

  Preserve existing success/warning/danger/info meanings. Do not recolor paid/success status merely to demonstrate branding.

- [ ] **Step 4: Convert only minimal identity/primary-action proof points**

  Replace only narrowly scoped styles necessary to visibly demonstrate runtime tokens, for example one primary action/focus/link path shared by Login/Main shell. Prefer CSS utility classes such as:

  ```css
  .brand-primary-action {
    background: var(--brand-primary);
    color: var(--brand-contrast);
  }
  .brand-primary-action:hover {
    background: var(--brand-primary-hover);
  }
  ```

  Do not mechanically replace all `emerald` classes.

- [ ] **Step 5: Add semantic-isolation regression scan**

  Fail if known semantic status selectors are changed to `--brand-primary`, or if semantic CSS variables reference `--brand-*`.

- [ ] **Step 6: Run CSS/runtime tests GREEN and production builds locally/in CI**

  Require focused tests plus candidate `build:pages` and `build:vps` at the authoritative CI gate.

- [ ] **Step 7: Commit Task 5 patches/tests**

  `feat(v15-task3): add brand and semantic css tokens`

---

### Task 6: Authoritative Task 3 TDD Gate

**Files:**
- Create: `.github/workflows/v15-task3-tdd.yml`
- Store reviewed byte-exact Task 3 candidate patches/tests using the repository's established V15 immutable-candidate transport pattern.

**Interfaces:**
- Consumes immutable Task 2 artifact ID `9285398323` and Tasks 1–5 patch set.
- Produces authoritative RED→GREEN evidence before production candidate creation.

- [ ] **Step 1: Download and hash-check immutable Task 2 candidate**

  Workflow must download from source run `32021078155`, artifact `v15-task2-candidate-pending-d1-smoke`, verify its manifest/hash files, then extract Master to an isolated work directory.

- [ ] **Step 2: Run RED stages before production patches**

  Apply test patches first and prove the focused Task 3 tests fail for the expected missing runtime/contracts. A RED stage that fails only because patch transport/hash is broken does not count.

- [ ] **Step 3: Apply production patches and run GREEN**

  Run all Task 3 focused tests after applying production patches. Require 0 failures.

- [ ] **Step 4: Run static security/scope checks**

  Require:
  - no new `d1-migrations/*` file,
  - no changes to Task 2 public endpoint response fields,
  - no Settings branding editor implementation,
  - no arbitrary CSS/server HTML injection path,
  - no logging of `logoDataUri`,
  - no `setInterval`/retry loop in branding bootstrap,
  - ThemeProvider root coverage anchors present.

- [ ] **Step 5: Run lint/types/build gates**

  From reconstructed candidate after `npm ci`:

  ```text
  focused Task 3 tests
  npm run lint
  Cloudflare type gate
  npm run build:pages
  npm run build:vps
  ```

- [ ] **Step 6: Review gate output before moving on**

  Do not create a production candidate if any RED/GREEN, lint, type, Pages, VPS, security, or scope check is non-zero.

- [ ] **Step 7: Commit workflow/evidence harness**

  `ci(v15-task3): add theme runtime TDD gate`

---

### Task 7: One Master Package Parity

**Files:**
- Extend existing candidate package parity tests or create `tests/v15-task3-package-parity.test.ts` if a focused file is clearer.
- Modify package builder only if a failing parity test proves current copy/generation logic omits a Task 3 runtime file.

**Interfaces:**
- Consumes Tasks 1–5 candidate tree.
- Produces Demo/Basic/Standard/Pro packages with identical Task 3 runtime source and unchanged plan entitlements.

- [ ] **Step 1: Write package parity assertions**

  Every generated package must contain byte-identical copies of:

  ```text
  src/theme/brandTheme.ts
  src/theme/brandingClient.ts
  src/context/ThemeContext.tsx
  src/components/BrandingBootScreen.tsx
  src/App.tsx
  src/index.css
  ```

  Entitlement matrix must remain Demo=false, Basic/Standard/Pro=true for whiteLabel.

- [ ] **Step 2: Add sensitivity proof**

  In CI only, temporarily remove one Task 3 runtime file before package verification and prove the parity test fails. Restore the file before real package generation.

- [ ] **Step 3: Run real package generation/release gates**

  Execute the existing preview generation, builder tests, guarded customer-ready release builder, and final parity/static audit for all four plan ZIPs.

- [ ] **Step 4: Do not edit builder if tests already pass**

  A passing builder is evidence that existing One Master copy semantics already include Task 3 files; do not make a no-op production change merely to create a commit.

- [ ] **Step 5: Commit only actual test/builder changes**

  `test(v15-task3): enforce theme runtime package parity`

---

### Task 8: Immutable Task 3 Source/Release Candidate

**Files:**
- Create: `.github/workflows/v15-task3-production-gate.yml`
- Output candidate artifact and SHA manifests; no application change is allowed in this task.

**Interfaces:**
- Consumes immutable Task 2 candidate + reviewed Task 3 patches.
- Produces one immutable Task 3 Master candidate and four package candidates pending real D1/browser smoke.

- [ ] **Step 1: Reconstruct candidate from exact immutable Task 2 source**

  Verify Task 2 source/master hashes before applying Task 3 patches. Fail closed on any mismatch.

- [ ] **Step 2: Apply all reviewed Task 3 patches exactly once**

  Reject fuzzy/unexpected patch application. Run `git diff --check` or equivalent patch sanity check in the reconstructed workspace.

- [ ] **Step 3: Build Master candidate before dependency/generated-output contamination**

  Create the immutable Master source ZIP before `npm ci` or generated release directories can be accidentally included. Generate and record SHA-256.

- [ ] **Step 4: Run full authoritative source gate**

  Require, in order:

  ```text
  focused Task 3 tests
  relevant backup/runtime regressions
  full npm test
  npm run lint
  Cloudflare type gate
  npm run build:pages
  npm run build:vps
  preview package generation
  package builder/parity tests
  guarded customer-ready release builder
  final ZIP static audit
  ```

- [ ] **Step 5: Static-audit candidate content**

  Verify expected Task 3 files/tokens/timeout/root anchors exist and no new migration/API-field expansion/Settings editor slipped in. Avoid shell wildcard ambiguity for `functions/api/[[path]].ts`; extract/read exact paths safely before grep.

- [ ] **Step 6: Upload pending-D1-smoke artifact**

  Suggested artifact name:

  `v15-task3-candidate-pending-d1-smoke`

  Include Master ZIP, Demo/Basic/Standard/Pro candidate ZIPs, and strict SHA manifests.

- [ ] **Step 7: Record run/job/artifact IDs before real smoke**

  Do not label Task 3 production-ready yet.

- [ ] **Step 8: Commit production gate**

  `ci(v15-task3): add immutable production gate`

---

### Task 9: Real Pro + Demo Pages/D1/Browser Smoke and Final Status

**Files:**
- Create: `.github/scripts/v15_task3_d1_smoke.py`
- Create: `.github/scripts/v15_task3_browser_smoke.mjs`
- Create: `.github/workflows/v15-task3-d1-smoke.yml`
- Create after PASS only: `V15_TASK3_STATUS_TH.md`

**Interfaces:**
- Consumes exact immutable candidate artifact from Task 8.
- Produces sanitized Pro/Demo runtime evidence, cleanup evidence, final status.

- [ ] **Step 1: Build smoke from the exact Task 8 artifact**

  Workflow must download by Task 8 run ID/artifact name and verify Master/package SHA manifests before extraction. Never rebuild candidate source from branch head in the smoke job.

- [ ] **Step 2: Provision isolated Pro + Demo Cloudflare resources**

  Create unique temporary D1 databases and Pages projects, render `wrangler.jsonc`, set temporary JWT secrets, apply all existing migrations through `0006`, build, deploy, and use stable `<project>.pages.dev` smoke URLs.

- [ ] **Step 3: Pro API/D1 seed**

  Setup Pro owner/dorm, then set a distinctive paid branding color through the supported settings path or D1 seed that preserves Task 2 security semantics. Use a color with easy deterministic token expectations, for example `#123456`. Seed safe contact/logo values only as needed to prove context consumption; never print the logo payload.

- [ ] **Step 4: Run Pro headless Chromium assertions**

  Start headless Chromium against the deployed root/Login URL. The browser harness must wait until `[data-branding-boot="loading"]` disappears and then read `getComputedStyle(document.documentElement)`.

  Assert exact values produced by `deriveBrandTokens('#123456')` for:

  ```text
  --brand-primary
  --brand-primary-hover
  --brand-soft
  --brand-contrast
  ```

  Also assert semantic token values equal the default semantic constants and do not equal/rebind to brand primary solely because the tenant brand is `#123456`.

- [ ] **Step 5: Pro surface coverage browser assertions**

  Exercise URLs/entry states for Login/root, Tenant Portal route, and LINE Registration route far enough to prove each boots under the root ThemeProvider and branding initialization completes. Do not require authenticated tenant/business workflows unrelated to Task 3.

- [ ] **Step 6: Pro public/context security assertions**

  Confirm `/api/public/branding` exact allowlist remains unchanged and the browser/runtime state does not contain PromptPay, LINE, Google, subscription/license private metadata, internal logo key, or authentication credentials.

- [ ] **Step 7: Exercise deterministic fallback path**

  In browser automation, intercept/abort `/api/public/branding` for one fresh page load. Assert the neutral boot screen clears and root tokens become exact default `#1DB954` derivatives within a bounded interval slightly above 3000 ms. Also prove the page does not enter an uncontrolled request loop (exactly one intercepted branding request for that provider lifecycle).

- [ ] **Step 8: Demo browser/D1 assertions**

  Setup Demo with a dorm name. Seed stale/non-null color/contact/logo directly in D1 only to test defense in depth. Verify public API/runtime masks those paid fields, browser root uses exact default brand tokens, dorm identity remains the setup dorm name, and the app boots successfully.

- [ ] **Step 9: Minimal existing-system regression**

  Verify health/setup/login/public branding and at least one existing backup-export invariant (`formatVersion=1`, `schemaVersion=7`) so runtime/package changes cannot silently ship a broken server candidate. Do not re-run the entire Task 2 restore matrix unless a regression appears.

- [ ] **Step 10: Sanitize evidence**

  Evidence JSON may include booleans, HTTP statuses, token CSS values, candidate SHA, plan, and cleanup exit codes. It must not include JWTs, passwords, logo Data URI/base64, PromptPay ID, LINE/Google secrets, OAuth tokens, or temporary private credentials.

- [ ] **Step 11: Cleanup all temporary resources with `if: always()`**

  Require Pages Pro, D1 Pro, Pages Demo, and D1 Demo deletion exit code 0. Cleanup failure keeps the workflow failed even when feature assertions passed.

- [ ] **Step 12: Upload sanitized evidence and assert both plans passed**

  Suggested artifact: `v15-task3-d1-browser-smoke-evidence`.

- [ ] **Step 13: Write final status only after fresh PASS evidence**

  `V15_TASK3_STATUS_TH.md` must record:
  - source/release run + job + artifact IDs/digest,
  - immutable Master and four package SHA-256 values,
  - final D1/browser smoke run + job + evidence artifact ID/digest,
  - Pro exact DOM token results,
  - Demo default/masking results,
  - fallback one-request/3000 ms behavior,
  - semantic-isolation result,
  - cleanup 0 for all resources,
  - explicit statement that Settings UI/bill branding/broad surface restyling remain follow-up work.

- [ ] **Step 14: Commit final verified status**

  `docs(v15): record Task 3 verified completion`

---

## Final Verification Checklist

Before declaring Task 3 complete, independently re-read the approved design spec and confirm:

- [ ] ThemeProvider covers Login, Main App, Tenant Portal, LINE Registration.
- [ ] Exactly one normal public-branding fetch occurs per provider boot lifecycle.
- [ ] Timeout is exactly 3000 ms.
- [ ] Network/API/malformed failure reaches safe fallback and clears boot loading.
- [ ] Neutral boot surface is not brand-colored.
- [ ] Default brand is exactly `#1DB954`.
- [ ] Hover/soft formulas match the approved deterministic channel formulas.
- [ ] Contrast uses WCAG relative-luminance comparison against white and `#111111`.
- [ ] Semantic colors are independent constants.
- [ ] Demo masks brand color/logo/contact but preserves setup dorm name.
- [ ] Existing light/dark behavior remains unchanged.
- [ ] No new D1 migration.
- [ ] No public API field expansion.
- [ ] No Settings branding editor or broad green rewrite.
- [ ] One Master package parity passes for all four plans.
- [ ] Full tests/lint/types/Pages/VPS/package/release gates pass fresh.
- [ ] Real Pro + Demo Pages/D1 smoke passes from the immutable candidate.
- [ ] Headless Chromium verifies actual root CSS variables.
- [ ] Browser fallback intercept proves one request and default token recovery.
- [ ] All four Cloudflare temporary resources clean up with exit 0.
- [ ] Status document is written only after the above evidence exists.
