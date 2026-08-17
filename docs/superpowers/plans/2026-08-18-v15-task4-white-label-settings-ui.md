# V15 Task 4 — White-label Settings UI + Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing V15 white-label backend/runtime contracts editable from Settings with responsive live preview, logo upload/delete UX, and post-save runtime refresh without adding a migration or backend contract.

**Architecture:** Keep `SettingsView` as owner of authenticated settings form state/save lifecycle, extract White-label controls and preview into `WhiteLabelSettingsSection`, and add pure validation/file helpers. Extend existing `ThemeContext` with `refreshBranding()` that preserves current runtime branding on transient refresh failure. `App` continues to own canonical authenticated `settings` state and exposes `fetchSettings` to SettingsView after logo mutations.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, lucide-react, Node `node:test` + `tsx`, Vite, Cloudflare Pages/Workers D1, existing package builder/release tooling.

**Spec:** `docs/superpowers/specs/2026-08-18-v15-task4-white-label-settings-ui-design.md`

## Global Constraints

- Base source: immutable V15 Task 3 candidate artifact `9295620943`, Master SHA-256 `ea70213d83f87eaacfb9002beee1bc5b46bdc3aea158d3bf94d626ab5c0d53c2`.
- Work on `agent/v15-task1-white-label-contract`; do not merge `main` without explicit user instruction.
- No migration after `0006_add_white_label_settings.sql`; no White-label backend/API/backup schema expansion.
- White-label entitlement stays Demo=false, Basic/Standard/Pro=true.
- PromptPay stays Demo=true, Basic=false, Standard/Pro=true.
- `brandLogoUrl` is read-only and must never be sent in `PUT /api/settings`.
- Logo mutation uses existing `PUT /api/settings/logo` and `DELETE /api/settings/logo` only.
- Logo preflight allowlist PNG/JPEG/WebP, size 1..307,200 bytes; server validator remains authoritative.
- Initial branding bootstrap remains 3000 ms and fallback `#1DB954`.
- Manual refresh must preserve current runtime branding/tokens on transient failure.
- Live preview is scoped and must not mutate root CSS variables before save.
- Demo effective preview masks dormant paid branding: fallback `#1DB954`, no logo, no contact phone.
- One Master generates Demo/Basic/Standard/Pro; never patch generated packages independently.

---

### Task 1: Pure White-label UI Helpers

**Files:**
- Create: `src/utils/whiteLabelSettings.ts`
- Test: `tests/white-label-settings-ui-utils.test.ts`

**Interfaces:**
- Produces `WHITE_LABEL_LOGO_MAX_BYTES = 307_200`.
- Produces `normalizeWhiteLabelDraft(input)` returning `{ok:true,value}` or `{ok:false,error}`.
- Produces `validateLogoFileMeta({type,size})`.
- Produces `fileToDataUri(file: File): Promise<string>`.
- Produces `effectivePreviewBranding(...)`.

- [ ] **Step 1: Write failing tests** for canonical trim/uppercase, empty optional→null, invalid dorm/color/phone/footer, PNG/JPEG/WebP allowlist, zero/>307200 rejection, and Demo effective preview masking.

Core expectations:

```ts
assert.deepEqual(normalizeWhiteLabelDraft({
  dormName: '  My Dorm  ', brandColor: '#1db954', contactPhone: ' 081-234-5678 ', billFooter: '  Thank you  ',
}), {
  ok: true,
  value: { dormName: 'My Dorm', brandColor: '#1DB954', contactPhone: '081-234-5678', billFooter: 'Thank you' },
});
assert.equal(validateLogoFileMeta({ type: 'image/svg+xml', size: 100 }).ok, false);
assert.equal(validateLogoFileMeta({ type: 'image/png', size: 307_201 }).ok, false);
assert.deepEqual(effectivePreviewBranding({
  whiteLabelEnabled: false, dormName: 'Demo Dorm', brandColor: '#FF0000', contactPhone: '0812345678',
  savedLogoDataUri: 'data:image/png;base64,AAAA', pendingLogoDataUri: 'data:image/png;base64,BBBB',
}), { dormName: 'Demo Dorm', brandColor: '#1DB954', contactPhone: null, logoDataUri: null });
```

- [ ] **Step 2: Verify RED** with `npx tsx --test tests/white-label-settings-ui-utils.test.ts`; expected missing module.

- [ ] **Step 3: Implement minimal pure helper** using server-aligned rules: dorm 1..120 plain text, exact `#RRGGBB`, phone max32 and `[0-9+() .-]`, footer max500 plain text; empty optional values normalize to null. `fileToDataUri` uses `FileReader`; no storage or network.

- [ ] **Step 4: Verify GREEN** with the same focused test.

- [ ] **Step 5: Commit** `feat(v15-task4): add white-label UI helpers`.

---

### Task 2: Safe Manual `refreshBranding()`

**Files:**
- Modify: `src/context/ThemeContext.tsx`
- Modify: `tests/theme-root-runtime.test.ts`
- Create: `tests/theme-refresh-runtime.test.ts`

**Interfaces:**
- Add `refreshBranding: () => Promise<boolean>` to `ThemeContextType`.
- `true` only when fetched branding has `source === 'public'` and is applied.
- `false` on fallback/timeout/network/malformed response; current branding and root tokens remain unchanged.

- [ ] **Step 1: Write RED tests** asserting the public context signature, a manual refresh function, `source !== 'public'` fail-closed branch, token application on success, and absence of `setBrandingLoading(true)` inside manual refresh.

- [ ] **Step 2: Run** `npx tsx --test tests/theme-root-runtime.test.ts tests/theme-refresh-runtime.test.ts`; expected FAIL.

- [ ] **Step 3: Implement** one internal `applyRuntimeBranding(resolvedBranding)` helper used by initial bootstrap and manual refresh. Initial bootstrap behavior remains unchanged; manual refresh must not reopen neutral boot screen.

```ts
const refreshBranding = async (): Promise<boolean> => {
  const resolvedBranding = await fetchPublicBranding();
  if (resolvedBranding.source !== 'public') return false;
  applyRuntimeBranding(resolvedBranding);
  return true;
};
```

- [ ] **Step 4: Run GREEN** across brand/theme client/root/CSS tests.

- [ ] **Step 5: Commit** `feat(v15-task4): add safe branding refresh`.

---

### Task 3: `WhiteLabelSettingsSection` + Scoped Live Preview

**Files:**
- Create: `src/components/WhiteLabelSettingsSection.tsx`
- Test: `tests/white-label-settings-section.test.ts`

**Interfaces:** controlled props for dormName, brandColor, contactPhone, billFooter, saved/pending logo, `whiteLabelEnabled`, `canEditWhiteLabel`, `lockReason`, busy/error state, and change/upload/delete callbacks.

- [ ] **Step 1: Write RED source-contract test** requiring Thai heading/labels, exact file accept `image/png,image/jpeg,image/webp`, `deriveBrandTokens`, `effectivePreviewBranding`, Demo lock copy, role lock copy, and no `document.documentElement` use.

- [ ] **Step 2: Run** focused test; expected missing component.

- [ ] **Step 3: Implement responsive controlled section**:
  - heading `แบรนด์และข้อมูลหอพัก`;
  - dorm name input;
  - native color picker + `#RRGGBB` text input + `ใช้สีเริ่มต้น`;
  - contact phone;
  - footer textarea and 500-char counter;
  - file picker, `อัปโหลดโลโก้`, `ลบโลโก้` buttons (`type="button"`);
  - Demo message `White-label ปิดใช้งานใน Demo`;
  - role message `เฉพาะเจ้าของหอพัก/Admin เท่านั้นที่แก้ไข White-label ได้`;
  - compact responsive preview using `effectivePreviewBranding()` then `deriveBrandTokens()`;
  - preview styles scoped inline/local only, never global CSS variables.

- [ ] **Step 4: Run focused test + `npm run lint`**; expected PASS.

- [ ] **Step 5: Commit** `feat(v15-task4): add white-label settings preview`.

---

### Task 4: SettingsView White-label Integration

**Files:**
- Modify: `src/components/SettingsView.tsx`
- Test: `tests/white-label-settings-view-integration.test.ts`

**Interfaces:**
- New prop `onRefreshSettings?: () => Promise<void> | void`.
- Use `useTheme().refreshBranding`.
- `canEditWhiteLabel = isOwnerOrAdmin && hasPlanFeature(subscriptionPlan, 'whiteLabel')`.

- [ ] **Step 1: Write RED integration contract** asserting White-label entitlement gate, unchanged PromptPay gate, portable text fields in payload, absence of `brandLogoUrl:` in payload, dedicated logo PUT/DELETE endpoints, and calls to both `onRefreshSettings` and `refreshBranding` after successful logo mutation.

- [ ] **Step 2: Verify RED** with focused Task 1/3/4 tests.

- [ ] **Step 3: Add draft and status state**:

```ts
const canEditWhiteLabel = isOwnerOrAdmin && hasPlanFeature(subscriptionPlan, 'whiteLabel');
const whiteLabelLockReason = !isOwnerOrAdmin ? 'role' : !hasPlanFeature(subscriptionPlan, 'whiteLabel') ? 'plan' : null;
const [brandColor, setBrandColor] = useState('');
const [contactPhone, setContactPhone] = useState('');
const [billFooter, setBillFooter] = useState('');
const [pendingLogoDataUri, setPendingLogoDataUri] = useState<string | null>(null);
const [logoBusy, setLogoBusy] = useState(false);
const [logoError, setLogoError] = useState<string | null>(null);
const [brandingRefreshWarning, setBrandingRefreshWarning] = useState<string | null>(null);
```

Initialize text drafts from `settings.brandColor/contactPhone/billFooter` in existing settings effect.

- [ ] **Step 4: Replace old dorm-name section** with the controlled `WhiteLabelSettingsSection`; dormName is editable only through `canEditWhiteLabel`. Demo/staff retain read-only value.

- [ ] **Step 5: Implement logo select/upload/delete**. Selection runs preflight and `fileToDataUri`. Upload sends:

```ts
fetch('/api/settings/logo', {
  method: 'PUT',
  headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ logoDataUri: pendingLogoDataUri }),
});
```

Delete confirms first and sends DELETE to the same endpoint. Server errors use `readApiError`. Success clears pending state, awaits `onRefreshSettings?.()`, then awaits `refreshBranding()`. If refresh returns false, keep save/upload success and show warning; do not reset runtime to fallback.

- [ ] **Step 6: Gate main settings validation/payload**. When editable, validate via `normalizeWhiteLabelDraft`; send normalized `brandColor/contactPhone/billFooter` only for `canEditWhiteLabel`; never send `brandLogoUrl`. Keep existing required Settings fields and PromptPay/LINE/Google behavior unchanged. After successful settings save call `refreshBranding()` and separate refresh warning from save success.

- [ ] **Step 7: Run focused GREEN**:

```bash
npx tsx --test tests/white-label-settings-ui-utils.test.ts tests/white-label-settings-section.test.ts tests/white-label-settings-view-integration.test.ts tests/settings-white-label.test.ts tests/logo-api-contract.test.ts tests/plan-entitlements.test.ts tests/theme-refresh-runtime.test.ts
```

- [ ] **Step 8: Commit** `feat(v15-task4): wire white-label settings mutations`.

---

### Task 5: App Canonical Settings Refresh

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/white-label-app-refresh.test.ts`

- [ ] **Step 1: Write RED test** requiring `SettingsView` to receive `onRefreshSettings={() => fetchSettings()}`.
- [ ] **Step 2: Verify RED**.
- [ ] **Step 3: Pass existing `fetchSettings` through**; do not add another global store.
- [ ] **Step 4: Run GREEN + `npm run build:pages` + `npm run build:vps`**.
- [ ] **Step 5: Commit** `feat(v15-task4): refresh canonical settings after logo changes`.

---

### Task 6: Authoritative RED→GREEN CI Gate

**Files:**
- Create branch patch artifacts under `v15-task4-patches/` with tests separate from implementation.
- Create `.github/workflows/v15-task4-tdd.yml`.

- [ ] **Step 1: Export byte-exact tests-only and implementation patches** from isolated immutable Task 3 workspace and pin patch blob hashes.
- [ ] **Step 2: Workflow downloads artifact `9295620943`, verifies Task 3 Master SHA `ea70213d83f87eaacfb9002beee1bc5b46bdc3aea158d3bf94d626ab5c0d53c2`, runs `npm ci`, applies tests only and proves RED, applies implementation and proves GREEN.**
- [ ] **Step 3: Full gate:** `npm test`, lint, Cloudflare types, Pages build, VPS build, `git diff --check`, backup/theme/logo regressions, and static audit proving no new migration/backend endpoint/backup contract.
- [ ] **Step 4: Fix only proven source or harness causes; never weaken contract. Record successful run/job IDs.**

---

### Task 7: One Master Package Parity

**Files:**
- Add Task 4 parity/sensitivity test/harness.
- Create `.github/workflows/v15-task4-package-parity.yml`.

- [ ] **Step 1: Generate Demo/Basic/Standard/Pro from one Master and require Task 4 runtime/UI files byte-identical:** `WhiteLabelSettingsSection.tsx`, `SettingsView.tsx`, `whiteLabelSettings.ts`, `ThemeContext.tsx`, `App.tsx`, and Task 4 tests.
- [ ] **Step 2: Do not byte-compare known materialized plan files such as `planEntitlements.ts`; use authoritative entitlement tests for semantics.**
- [ ] **Step 3: Sensitivity mutation must deliberately alter/remove one Task 4 runtime file in one generated plan and prove parity fails.**
- [ ] **Step 4: Run package builder/release + final lint/types/Pages/VPS gate and record successful run/job.**

---

### Task 8: Immutable Task 4 Production Candidate

**Files:**
- Create `.github/workflows/v15-task4-production-gate.yml`.

- [ ] **Step 1: Assemble exact Task 4 source from immutable Task 3 artifact + verified patches, never stale repository root.**
- [ ] **Step 2: Run focused Task 4, Task 1–3 white-label/logo/theme, backup, full tests, lint, Cloudflare types, Pages/VPS builds, PREVIEW generation, guarded CUSTOMER-READY builder, One Master parity, and static audit.**
- [ ] **Step 3: Upload `v15-task4-candidate-pending-d1-smoke` containing Master + Demo/Basic/Standard/Pro ZIPs. Capture artifact ID/digest and SHA-256 for all five ZIPs.**

---

### Task 9: Real Pro + Demo D1/Pages/Browser Smoke + Final Status

**Files:**
- Create `.github/workflows/v15-task4-d1-browser-smoke.yml`.
- Add focused browser helper only if needed.
- Create `V15_TASK4_STATUS_TH.md` only after fresh successful evidence.

- [ ] **Step 1: Provision temporary Pro/Demo D1 and Pages; apply migrations through `0006` exactly; cleanup must run always.**
- [ ] **Step 2: Pro smoke proves owner Settings controls editable; text branding save; supported logo upload; public branding update; scoped draft preview does not change root tokens before save; post-save manual refresh changes computed `--brand-primary` without full reload; logo delete clears authenticated/public/runtime logo; backup regression remains intact.**
- [ ] **Step 3: Demo smoke proves setup dorm name remains visible, controls locked, effective preview is `#1DB954` + no logo/contact despite dormant values, settings White-label mutation and logo PUT/DELETE stay `403 PLAN_REQUIRED`, public branding masks paid fields, runtime primary remains `#1DB954`.**
- [ ] **Step 4: Verify temporary Pages/D1 cleanup succeeds. Cleanup failure blocks completion.**
- [ ] **Step 5: Write status with source/release run/job, artifact ID/digest, five SHA-256 values, D1/browser run/job, evidence artifact ID/digest, exact verified behavior, remaining V15 scope, and `main` merge policy.**
- [ ] **Step 6: Commit status only after all fresh evidence is green; do not claim Task 4 complete from partial runs.**
