# V15 Task 4 — White-label Settings UI + Live Preview — Design

Date: 2026-08-18
Status: APPROVED DESIGN — pending written-spec review
Branch: `agent/v15-task1-white-label-contract`
Base: immutable V15 Task 3 candidate artifact `9295620943`

## 1. Goal

Task 4 ทำให้ White-label ที่มี backend contract และ Theme Runtime พร้อมแล้วจาก Task 1–3 สามารถใช้งานได้จริงจากหน้า Settings โดยไม่เปลี่ยนฐานข้อมูลหรือ contract ฝั่ง server เพิ่ม

ผู้ใช้ที่มีสิทธิ์ต้องสามารถ:

- แก้ชื่อหอพัก
- เลือกสีหลักของแบรนด์
- ระบุเบอร์ติดต่อ
- ระบุข้อความท้ายบิล
- เลือกและอัปโหลดโลโก้ PNG/JPEG/WebP
- ลบโลโก้เดิม
- เห็น Live Preview ของค่าที่กำลังแก้ก่อนบันทึก
- หลังบันทึกแล้ว Theme Runtime ใช้ค่าที่บันทึกใหม่ทันทีโดยไม่ต้อง reload หน้า

Task 4 เป็น Settings/UX layer เท่านั้น ไม่ใช่งานเปลี่ยน visual ทั้งระบบ

## 2. Existing contracts that Task 4 must preserve

Task 4 ต้องใช้ contract ที่มีอยู่แล้วและห้ามสร้าง contract แข่งใหม่

### Settings contract

`GET /api/settings` มี fields ต่อไปนี้อยู่แล้ว:

- `dormName`
- `brandColor`
- `contactPhone`
- `billFooter`
- `brandLogoUrl`
- `whiteLabelEnabled`

`PUT /api/settings` มี White-label normalization/diff gate อยู่แล้ว:

- `dormName`: trim, plain text, 1..120 chars
- `brandColor`: null/empty -> null, otherwise exact `#RRGGBB`, stored uppercase
- `contactPhone`: nullable, trim, max 32, characters limited to numbers/space/`+ - ( ) .`
- `billFooter`: nullable, trim, max 500, plain text
- `brandLogoUrl` เป็น read-only และห้ามส่งกลับเข้า PUT settings

Task 4 ห้าม bypass validator เหล่านี้

### Logo contract

ใช้ endpoint เดิมเท่านั้น:

- `PUT /api/settings/logo` body `{ logoDataUri }`
- `DELETE /api/settings/logo`

Logo ที่อนุญาต:

- PNG
- JPEG
- WebP
- decoded size > 0 และไม่เกิน 307,200 bytes
- server เป็น authoritative validator สำหรับ MIME/base64/magic bytes

Task 4 จะทำ client preflight เฉพาะ MIME และ file size เพื่อ UX ที่เร็วขึ้น แต่ server validation ยังเป็น final authority

### Entitlement contract

White-label:

- Demo: false
- Basic: true
- Standard: true
- Pro: true

PromptPay ต้องคง entitlement เดิมและแยกจาก White-label:

- Demo: true
- Basic: false
- Standard: true
- Pro: true

Task 4 ห้ามเปลี่ยน entitlement table

### Role contract

White-label mutation ทำได้เฉพาะ `owner` / `super_admin`

staff/caretaker แม้เข้าหน้า Settings ได้ ห้ามแก้ White-label และ backend authorization เดิมยังต้องเป็นชั้นบังคับสุดท้าย

## 3. UI architecture

### 3.1 New isolated component

เพิ่ม component:

`src/components/WhiteLabelSettingsSection.tsx`

เหตุผล: `SettingsView.tsx` มี responsibilities จำนวนมากอยู่แล้ว การเพิ่ม logo file handling, live preview, plan/role lock state และ validation ทั้งหมดลงไฟล์เดิมจะทำให้ coupling สูงขึ้น

`WhiteLabelSettingsSection` รับค่า draft และ callbacks จาก `SettingsView` ไม่ fetch `/api/settings` เอง

หน้าที่ของ component:

- แสดง heading `แบรนด์และข้อมูลหอพัก`
- dorm name input
- brand color controls
- contact phone input
- bill footer textarea + character counter
- logo picker/upload/delete controls
- plan/role lock messaging
- isolated live preview card

`SettingsView` ยังคงเป็น owner ของ form state และ main save lifecycle

### 3.2 Existing dorm name field

ย้าย UI ของ `dormName` จาก section `ข้อมูลและชื่อสถานประกอบการ` เดิมเข้า White-label section เพื่อไม่ให้มี input ซ้ำสองจุด

Semantics ของ dorm name ไม่เปลี่ยน:

- dorm name ไม่ถือเป็น paid-branding field โดยตัวมันเอง
- mutation ยังอิง `canManageSettings` เดิม
- Demo ยังคงเห็น dorm name ได้
- Task 4 ไม่สร้าง bypass สำหรับ Demo ให้แก้ dormName ผ่าน `/api/settings`; first-setup exception ยังคงอยู่ที่ `/api/setup/init` ตาม Task 1

### 3.3 White-label edit permission in UI

กำหนด:

`canEditWhiteLabel = isOwnerOrAdmin && hasPlanFeature(subscriptionPlan, 'whiteLabel')`

พฤติกรรม:

- owner/super_admin + Basic/Standard/Pro: controls paid-branding ใช้งานได้
- Demo owner: เห็น values/preview แต่ paid-branding controls disabled และแสดงข้อความว่า White-label ใช้ได้ตั้งแต่ Basic
- staff/caretaker: เห็น section แบบ read-only และแสดงข้อความ `เฉพาะเจ้าของหอพัก/Admin เท่านั้นที่แก้ไข White-label ได้`

ห้ามใช้ `settings.whiteLabelEnabled` เพียงตัวเดียวเป็น authorization; ใช้ local entitlement/role เพื่อ UX และ backend เป็น authoritative authorization

## 4. Draft state and validation

เพิ่ม local state ใน `SettingsView`:

- `brandColor: string`
- `contactPhone: string`
- `billFooter: string`

Initialize จาก `settings`:

- null -> empty string
- persisted brand color -> uppercase

เพิ่ม pure helper module:

`src/utils/whiteLabelSettings.ts`

หน้าที่:

- validate/normalize draft สำหรับ UI
- validate selected logo file metadata
- convert File -> Data URI
- ไม่ทำ network
- ไม่ mutate DOM

### UI validation

ก่อน main settings save:

- dormName trim ต้อง 1..120 และ plain text
- brandColor ถ้าไม่ว่างต้อง exact `#RRGGBB`; normalize uppercase
- contactPhone ถ้าไม่ว่าง max 32 และใช้ character set เดียวกับ server
- billFooter ถ้าไม่ว่าง max 500 และ plain text

Server ยังตรวจซ้ำเสมอ

### Brand color UX

มีทั้ง:

- native color picker สำหรับเลือกเร็ว
- text input สำหรับใส่ `#RRGGBB`
- ปุ่ม `ใช้สีเริ่มต้น` ทำให้ draft เป็น empty string ซึ่งหมายถึง `null` ตอนส่ง server

Preview เมื่อ draft color ว่างให้ใช้ Task 3 fallback `#1DB954`

ห้าม apply draft color ไปยัง `document.documentElement` ก่อน save; live preview ต้อง scoped อยู่ใน preview component เท่านั้น

## 5. Logo UX and mutation flow

### 5.1 Selecting a logo

File input accept เฉพาะ:

- `image/png`
- `image/jpeg`
- `image/webp`

Client preflight:

- file size ต้อง > 0
- file size <= 307,200 bytes
- MIME ต้องอยู่ใน allowlist

จากนั้น FileReader แปลงเป็น Data URI เพื่อใช้ preview

ไม่มี image resize, crop, recompress หรือ pixel-dimension enforcement ใน Task 4

### 5.2 Pending logo preview

การเลือกไฟล์ยังไม่เขียน server ทันที

UI เก็บ `pendingLogoDataUri` เฉพาะ memory และ preview ใช้ค่าลำดับนี้:

1. pending logo ที่เพิ่งเลือก
2. logo ที่บันทึกแล้วจาก `settings.brandLogoUrl` / refreshed settings
3. no-logo fallback

ห้ามเก็บ logo Data URI ลง localStorage/sessionStorage

### 5.3 Upload action

มีปุ่ม `อัปโหลดโลโก้` แยกจาก main settings save เพราะ backend ใช้ dedicated logo endpoint อยู่แล้ว

เมื่อกด:

1. ตรวจ `canEditWhiteLabel`
2. PUT `/api/settings/logo` พร้อม Authorization และ JSON `{ logoDataUri }`
3. ถ้า server reject ให้แสดง message จาก `readApiError`; ห้ามแปลง 400/403 เป็นข้อความ success
4. ถ้าสำเร็จ ให้ clear pending state
5. refresh authenticated settings ใน App
6. refresh public branding runtime

### 5.4 Delete action

มี confirm ก่อน DELETE

เมื่อสำเร็จ:

- clear pending logo
- refresh authenticated settings
- refresh public branding runtime

หาก mutation logo สำเร็จแต่ runtime refresh ชั่วคราวไม่สำเร็จ ต้องบอกผู้ใช้ว่า logo บันทึกแล้ว แต่ theme refresh ไม่สำเร็จ และสามารถ reload หน้าได้ ห้ามรายงานว่า server save ล้มเหลว

## 6. Main settings save flow

Brand text fields ใช้ main settings save lifecycle เดิม ไม่สร้าง backend endpoint ใหม่

แก้ `buildSettingsPayload()` ให้ include fields White-label เฉพาะเมื่อ UI มีสิทธิ์ส่ง:

- `brandColor`
- `contactPhone`
- `billFooter`

`brandLogoUrl` ห้ามอยู่ใน payload

สำหรับ user ที่ไม่มีสิทธิ์ White-label ต้อง omit paid-branding fields แทนการส่งค่ากลับไปโดยไม่จำเป็น

`dormName` ยังคงอยู่ใน payload ตาม semantics เดิม

หลัง `onUpdateSettings()` สำเร็จ:

1. update settings state ตาม flow เดิม
2. เรียก `refreshBranding()`
3. ถ้า public branding refresh สำเร็จ root brand tokens และ runtime identity เปลี่ยนทันที
4. ถ้า refresh ไม่สำเร็จ ให้คง branding runtime เดิมและแสดง warning แยกจาก save success

Task 4 ต้องไม่ reset เป็น fallback branding เพียงเพราะ refresh หลัง save เจอ transient network error

## 7. ThemeContext refresh contract

ขยาย `ThemeContextType` ด้วย:

`refreshBranding: () => Promise<boolean>`

Behavior:

### Initial bootstrap

คง Task 3 contract เดิม:

- load public branding ครั้งแรก
- timeout 3000 ms
- failure -> fallback branding
- branding boot gate ปลดหลัง resolve/fallback

### Manual refresh

`refreshBranding()`:

- ไม่เปิด neutral boot screen ใหม่
- fetch public branding ผ่าน client เดิม
- ถ้า response มี `source: 'public'`:
  - apply derived root brand tokens
  - replace runtime branding snapshot
  - return `true`
- ถ้า response กลายเป็น fallback เพราะ timeout/network/malformed response:
  - preserve current runtime branding และ root tokens
  - return `false`

เหตุผล: server mutation กับ runtime refresh เป็นคนละ operation; transient refresh failure ต้องไม่ทำให้ UI ที่เพิ่ง save สำเร็จเด้งกลับ default brand แบบผิดความจริง

## 8. Live Preview design

Preview ต้องเป็น compact card ใน White-label section และ responsive บน mobile

แสดง:

- logo หรือ placeholder icon
- dorm name draft
- brand-color primary sample
- contact phone ถ้ามี
- bill-footer draft ถ้ามี
- primary action sample เพื่อให้เห็น primary/contrast combination

ใช้ `deriveBrandTokens()` จาก Task 3 เพื่อให้ preview algorithm ตรงกับ runtime จริง

Preview ใช้ inline/scoped styles เท่านั้น และห้ามแก้ global CSS variables ก่อน save

Semantic status colors ไม่อยู่ในการ preview re-theme และ Task 4 ห้ามเปลี่ยน status tokens

## 9. Error and status handling

แยก status อย่างน้อยเป็น:

- main settings validation/save error
- logo validation/upload/delete error
- branding runtime refresh warning

ต้องแยก `saved` ออกจาก `runtime refreshed` อย่างชัดเจน

ตัวอย่าง semantics:

- PUT settings 200 + refreshBranding false -> save success + warning
- PUT logo 400 -> upload failed, pending preview ยังอยู่เพื่อให้ผู้ใช้แก้/เลือกใหม่
- PUT/DELETE logo 403 PLAN_REQUIRED -> แสดง plan error จาก server
- PUT/DELETE logo 403 FORBIDDEN -> แสดง role error จาก server

ห้าม log full logo Data URI

## 10. App integration

`App.tsx` ต้อง expose authenticated settings refresh ให้ SettingsView เช่น:

`onRefreshSettings={fetchSettings}`

ใช้หลัง logo mutation เพื่อให้ `settings.brandLogoUrl` ใน App เป็น canonical state ใหม่

Task 4 ห้ามสร้าง global store ใหม่

## 11. Tests

เพราะ project ปัจจุบันใช้ Node/tsx contract tests และไม่มี React Testing Library, Task 4 จะไม่เพิ่ม heavy frontend test framework เฉพาะงานนี้

### Pure tests

ทดสอบ `src/utils/whiteLabelSettings.ts`:

- valid/invalid #RRGGBB
- uppercase normalization
- empty color -> null/default preview semantics
- phone max/pattern
- footer max/plain text
- logo MIME allowlist
- logo zero byte / >307200 rejection

### Source/integration contract tests

ตรวจว่า:

- SettingsView/WhiteLabelSettingsSection ใช้ `whiteLabel` entitlement
- owner/super_admin gate มีอยู่
- Demo lock messaging มีอยู่
- `brandLogoUrl` ไม่ถูกส่งใน settings PUT payload
- logo PUT/DELETE ใช้ dedicated endpoint เดิม
- `refreshBranding()` ถูกเรียกหลัง successful settings/logo mutation
- preview ใช้ `deriveBrandTokens()` และไม่ apply global root variables
- PromptPay section/entitlement ไม่ถูกผูกกับ whiteLabel

### Regression/build gate

ต้องผ่าน:

- focused Task 4 tests RED -> GREEN
- `npm test`
- `npm run lint`
- `npm run check:cloudflare-types:master`
- `npm run build:pages`
- `npm run build:vps`
- backup regression
- Task 3 theme runtime regressions
- package builder/release tests

### One Master package parity

Demo/Basic/Standard/Pro ต้องได้ UI/runtime source ชุดเดียวจาก Master

plan behavior ต้องมาจาก entitlement data ไม่ใช่แก้ generated package แยก

### Real Cloudflare smoke

จาก immutable Task 4 candidate:

Pro/paid smoke ต้องพิสูจน์อย่างน้อย:

- owner เปิด Settings และ White-label controls ใช้งานได้
- save color/phone/footer ผ่าน authenticated API
- upload supported logo ผ่าน API
- public branding สะท้อนค่าที่บันทึก
- browser runtime token เปลี่ยนโดยไม่ full-page reload หลัง refresh flow
- delete logo สำเร็จและ runtime/public branding ไม่มี logo

Demo smoke ต้องพิสูจน์:

- dorm name ยังอ่านได้
- paid White-label controls locked
- server logo mutation ยัง 403 PLAN_REQUIRED
- public branding ยัง mask paid branding
- runtime ยัง fallback primary `#1DB954`

cleanup temporary Pages/D1 resources ต้องผ่าน

## 12. Out of scope

Task 4 ไม่ทำ:

- client-side logo resize/crop/recompress
- pixel-dimension validation
- R2/object storage
- logo portability in backup
- dashboard-wide replacement ของ hard-coded green
- full Login visual integration
- Bill/PDF/JPG branding output
- Tenant Portal full visual branding
- LINE registration full visual branding
- backend migration/API expansion
- entitlement changes
- PromptPay behavior changes

งานเหล่านี้ต้องอยู่ Task ถัดไปเพื่อให้ Task 4 มี scope ที่ตรวจสอบได้และ rollback ได้ง่าย

## 13. Acceptance criteria

Task 4 ถือว่า complete เมื่อทั้งหมดเป็นจริง:

1. owner/super_admin ของ Basic/Standard/Pro แก้ brand color/contact phone/bill footer และจัดการ logo ได้จาก Settings
2. dorm name อยู่ใน White-label Settings section แต่ semantics เดิมไม่เปลี่ยน
3. Demo เห็นข้อมูล/preview แต่ paid-branding controls locked
4. staff/caretaker ไม่สามารถ mutate White-label ผ่าน UI และ backend regression ยังป้องกันอยู่
5. live preview เปลี่ยนตาม draft โดยไม่ mutate global runtime ก่อน save
6. settings save สำเร็จแล้ว runtime branding refresh โดยไม่ reload
7. logo upload/delete ใช้ dedicated Task 2 API และ refresh settings/runtime หลัง success
8. refresh failure ไม่ทำให้ persisted save ถูกตีความว่า failed และไม่ reset runtime เป็น fallback โดยไม่จำเป็น
9. PromptPay entitlement ไม่เปลี่ยน
10. ไม่มี migration ใหม่, backup schema ใหม่ หรือ backend White-label contract ใหม่
11. One Master package parity ผ่าน
12. immutable candidate ผ่าน real Pro + Demo Cloudflare D1/Pages/browser smoke
13. ยังไม่ merge `main` จนกว่าผู้ใช้สั่ง merge โดยตรง
