# V15 Task 7 Status — Tenant Portal / Public Branding Polish

สถานะ: **PASS — Task 7 verified complete**

วันที่ตรวจ: 2026-08-18
Branch: `agent/v15-task1-white-label-contract`

## Scope ที่ปิดแล้ว

Task 7 ทำให้ Tenant Portal ใช้ effective runtime white-label branding เดียวกับ Login/App shell โดยไม่เพิ่ม API, D1 schema, backup schema หรือ migration ใหม่

- Public Tenant Portal lookup ใช้ runtime `dormName`
- Public Tenant Portal lookup ใช้ runtime logo พร้อม `Building2` fallback
- ปุ่ม/โฟกัส/brand-facing lookup surfaces ใช้ `--brand-primary`, `--brand-primary-hover`, `--brand-soft`, `--brand-contrast`
- Active Tenant Portal header ใช้ runtime dorm name + logo + brand tokens
- ไม่ใช้ `settings?.dormName` เป็น identity source ใน Tenant Portal อีกต่อไป
- Branding boot gate ยังครอบ `AppSurface` รวม Tenant Portal และ Login ก่อน render
- public branding failure ยัง fallback ผ่าน ThemeProvider/branding client เดิม
- Demo ยัง mask paid logo/color/contact และใช้ default brand color
- semantic success / warning / error / announcement colors ไม่ถูกเปลี่ยนเป็น brand color
- ไม่มี migration หลัง `0006_add_white_label_settings.sql`

## TDD evidence

RED บน immutable Task 6 candidate:
- Task 7 source contract ล้มเพราะ Tenant Portal ยังไม่มี `useTheme`, runtime logo/name และยังมี blue/indigo identity

GREEN หลัง deterministic patch:
- `tests/task7-tenant-portal-branding.test.mjs` = 4/4 PASS

Fresh local verification ก่อนปิด Task:
- Task 7 source contract = 4/4 PASS
- highest D1 migration = `0006_add_white_label_settings.sql`
- Cloudflare smoke evidence assertions = PASS

## Production Gate

Run ID: `32117229708`
Attempt: `1`
Source SHA: `b28fac069f893739cc4fd774749f58e2e0d978b2`
Result: **SUCCESS**

Production Gate ผ่านครบ:
- pinned Task 7 patch/test verification
- immutable Task 6 candidate verification
- RED proof
- deterministic patch apply
- GREEN proof
- fresh `npm ci`
- focused Task 7 contracts
- branding/public/Login regressions
- backup regression
- full test suite
- TypeScript lint
- Cloudflare types
- Pages build
- VPS build
- package generation/release
- One Master/package parity audit

Task 7 candidate artifact:
- Artifact ID: `9317174783`
- Artifact digest: `sha256:2f475ac6daaae661442b3cb13b60b8d4ed82c74570c2e67ed70a8242bbbf0d3e`
- Master SHA-256: `2d9a1a17bfc6a0e4da1edf0cda2fc4c9a488a2f5807bc16e36cabafea8aff231`
- Basic SHA-256: `908a2147055a1e9b91f40f78b5f95a65ee41e0cdb54bca074a690a87a3ff0a57`
- Demo SHA-256: `ad02052c10fb50eb4d48c13caa5cdc3e553a85b28689b4255a519a7c4d703946`
- Pro SHA-256: `5fe906c99f22a92325015b7800079af6d68b3c08f13d3285e7093791bccf1916`
- Standard SHA-256: `ab987a18f79f0ef3de0dd0fa8ef73e54f1de2df223c24060d33f818d53669af4`

## Cloudflare Tenant Portal Browser Smoke

Run ID: `32117658608`
Attempt: `1`
Source SHA: `7f467f65bfbdfb79ea2c15993f09682835019486`
Candidate Artifact ID: `9317174783`
Result: **SUCCESS**

Evidence artifact:
- Artifact ID: `9317402117`
- Digest: `sha256:0e3b6aca5dfdac21b6082f8c066316b9d3c598db486024bd61742c8d076c625e`

Pro real Cloudflare/D1/Pages browser evidence:
- public branding: `Task 7 Pro Dorm`
- effective brand: `#6D28D9`
- lookup dorm name visible
- lookup logo visible
- lookup submit button background = runtime brand
- branding boot gone before lookup assertion
- real room/phone verification reaches active Tenant Portal
- active header dorm name visible
- active logo visible
- active dorm badge uses runtime brand color
- semantic success and repair markers preserved

Demo real Cloudflare/D1/Pages browser evidence:
- public dorm name: `Task 7 Demo Dorm`
- dormant stored brand color: red, but public paid branding masked
- effective UI brand fallback: `#1DB954`
- lookup logo not visible
- active header logo not visible
- real room/phone verification reaches active Tenant Portal
- dorm name remains visible
- semantic success and repair markers preserved

Cleanup evidence:
- Pro Pages delete = 0
- Pro D1 delete = 0
- Demo Pages delete = 0
- Demo D1 delete = 0

## Boundary

Task 7 complete หมายถึง Tenant Portal และ public branding polish ผ่าน gate แล้ว แต่ **ยังไม่ใช่ V15 CUSTOMER-READY** และยังไม่ merge `main`.

งานถัดไปคือ **V15 Task 8 — Final V15 Integration / Acceptance Matrix / Release Gate** ซึ่งต้องตรวจ V15 White-label ทุก surface รวมกัน, all-plan parity, security/migration/ZIP integrity และ final Cloudflare release evidence ก่อนประกาศ CUSTOMER-READY.
