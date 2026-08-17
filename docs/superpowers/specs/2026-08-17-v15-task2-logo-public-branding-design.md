# V15 Task 2 — Logo Asset Contract + Public Branding API

วันที่: 2026-08-17
สถานะ: Design approved for written-spec review
ฐานงาน: V15 Task 1 verified complete
Task 1 status commit: `efe98d32cae54256a1b7745824f3ecdad26f3aac`
Task 1 source/release gate: run `31996317195` = PASS
Task 1 real D1 smoke: run `31999654570` = PASS

## 1. เป้าหมาย

Task 2 ทำให้ White-label จาก Task 1 เริ่มมีโลโก้ที่ใช้งานได้จริง และเพิ่ม public branding endpoint สำหรับหน้า Login/Setup/Public UI โดยไม่เปิดเผยข้อมูลลับหรือ payment/integration metadata

ขอบเขตหลัก:
- ใช้ `settings.brand_logo_key` ที่ Task 1 สร้างไว้เป็น storage slot สำหรับ validated canonical Data URI
- เพิ่ม API สำหรับตั้ง/ลบโลโก้
- เพิ่ม `GET /api/public/branding`
- ให้ `GET /api/settings` project โลโก้ออกมาเป็น `brandLogoUrl` โดยไม่ expose raw/internal field name
- รักษา White-label entitlement matrix จาก Task 1: Demo=false, Basic/Standard/Pro=true
- ไม่เพิ่ม migration ใหม่ใน Task 2

## 2. แนวทาง Storage ที่อนุมัติ

เลือกแนวทาง A:

`settings.brand_logo_key` จะเก็บ canonical Data URI โดยตรงใน V15 Task 2

ตัวอย่างค่าภายใน:

```text
data:image/png;base64,iVBORw0KGgo...
```

เหตุผล:
- ไม่เพิ่ม `brand_logo_data_uri` column ใหม่
- ไม่สร้างข้อมูลโลโก้ซ้ำสอง field
- ไม่เพิ่ม migration หลัง Task 1 เพิ่งผ่าน real D1 smoke
- API ภายนอกไม่ผูกกับชื่อ internal column และคืนชื่อ semantic คือ `logoDataUri` / `brandLogoUrl`
- ภายหลังหากย้าย binary ไป R2 สามารถเปลี่ยนความหมาย internal ของ `brand_logo_key` เป็น object key ได้โดยไม่เปลี่ยน public branding contract

ข้อจำกัดสำคัญ:
- `brand_logo_key` เป็น implementation detail ห้าม expose ชื่อนี้ใน public/authenticated JSON response
- Task 2 ไม่ตีความค่าเก่าที่อาจเป็น opaque key จากอนาคต; V15 Task 2 จะเขียนเฉพาะ canonical Data URI ใหม่ที่ผ่าน validator

## 3. Supported Logo Formats

รองรับเฉพาะ:
- PNG — `image/png`
- JPEG — `image/jpeg`
- WebP — `image/webp`

ไม่รองรับ:
- SVG
- GIF
- BMP
- ICO
- AVIF
- arbitrary binary
- remote URL

เหตุผลหลักที่ไม่รับ SVG คือหลีกเลี่ยง active-content/script/XML attack surface ใน White-label asset path

## 4. Logo Size Limit

ขนาดสูงสุดวัดจาก decoded binary จริง:

```text
300 KiB = 307,200 bytes
```

กติกา:
- ห้ามตัดสินจากความยาว base64 string อย่างเดียว
- decode สำเร็จก่อนแล้วตรวจ byte length
- byte length = 0 ถือว่า invalid
- เกิน 307,200 bytes -> `400 VALIDATION_ERROR`

Task 2 ยังไม่ enforce pixel width/height เพื่อหลีกเลี่ยงการเพิ่ม image decoder dependency โดยไม่จำเป็น; UI Task ภายหลังสามารถกำหนด recommended dimensions ได้

## 5. Canonical Data URI Contract

input ที่ยอมรับต้องอยู่รูป:

```text
data:<mime>;base64,<payload>
```

ตัวอย่าง:

```text
data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...
```

Normalization:
- MIME canonical lowercase
- base64 payload ต้อง decode แบบ strict
- ห้าม whitespace ภายใน payload
- หลัง validate ให้ encode binary ใหม่เป็น standard base64 แล้วประกอบ canonical Data URI ใหม่ก่อนเก็บ
- JPEG ใช้ canonical MIME `image/jpeg` เท่านั้น แม้ client พยายามส่ง alias อื่น

ห้ามรับ:
- URL-encoded data URI
- non-base64 data URI
- malformed header
- extra parameters เช่น `charset=`
- multiple comma segments ที่ทำให้ parsing ambiguous

## 6. Magic-byte Validation

MIME จาก Data URI header ไม่เพียงพอ ต้องตรวจ decoded bytes ด้วย

### PNG

ต้องเริ่มด้วย signature:

```text
89 50 4E 47 0D 0A 1A 0A
```

### JPEG

ต้องเริ่มด้วย:

```text
FF D8 FF
```

### WebP

ต้องมี:
- bytes 0..3 = `RIFF`
- bytes 8..11 = `WEBP`

ถ้า MIME header กับ magic bytes ไม่ตรงกัน -> `400 VALIDATION_ERROR`

## 7. Logo Validator Boundary

สร้าง helper/service ที่มีหน้าที่เดียว:
- parse Data URI
- strict base64 decode
- MIME allowlist
- magic-byte validation
- decoded-size validation
- canonical re-encode

Interface เชิง contract:

```ts
type SupportedLogoMime = 'image/png' | 'image/jpeg' | 'image/webp';

interface ValidatedLogoData {
  mime: SupportedLogoMime;
  bytes: Uint8Array;
  sizeBytes: number;
  dataUri: string;
}

function validateLogoDataUri(input: unknown): ValidatedLogoData;
```

helper ต้องไม่รู้เรื่อง D1, auth, plan entitlement หรือ HTTP response

## 8. Authenticated Logo API

เพิ่ม endpoints:

```text
PUT    /api/settings/logo
DELETE /api/settings/logo
```

### PUT /api/settings/logo

Request:

```json
{
  "logoDataUri": "data:image/png;base64,..."
}
```

Authorization:
1. authenticated
2. actor ต้องเป็น `owner` หรือ `super_admin`
3. effective owner plan ต้องมี `whiteLabel=true`

ผล plan:
- Demo -> `403 PLAN_REQUIRED`
- Basic -> allowed
- Standard -> allowed
- Pro -> allowed

staff/caretaker แม้มี permission จัดการ settings อื่น -> ไม่อนุญาตให้เปลี่ยนโลโก้ และต้องเป็น authorization 403 ไม่ใช่ `PLAN_REQUIRED`

หลัง validation สำเร็จ:
- update `settings.brand_logo_key` ของ effective owner ด้วย canonical Data URI
- ห้ามแก้ settings/integration field อื่น

Success response:

```json
{
  "success": true,
  "brandLogoUrl": "data:image/png;base64,..."
}
```

ห้าม response field `brandLogoKey`

### DELETE /api/settings/logo

Authorization เหมือน PUT

ผลสำเร็จ:
- set `settings.brand_logo_key = NULL`

Response:

```json
{
  "success": true,
  "brandLogoUrl": null
}
```

Demo ลบโลโก้ไม่ได้ผ่าน API นี้ เพราะเป็น White-label mutation เช่นเดียวกับการตั้งโลโก้

## 9. GET /api/settings Projection

Task 1 contract เดิมคืน `brandLogoUrl` แบบ read-only

Task 2 ทำให้ field นี้มีค่าจริง:
- หาก `brand_logo_key` เป็น valid V15 canonical Data URI -> คืนค่า Data URI
- ถ้า `NULL` -> `null`

ห้าม expose:
- `brand_logo_key`
- `brandLogoKey`

การอ่าน authenticated settings ยังรักษา owner scoping และ field เดิมทั้งหมด

## 10. Public Branding API

เพิ่ม endpoint:

```text
GET /api/public/branding
```

ไม่ต้อง login

Response shape:

```json
{
  "dormName": "My Dorm",
  "brandColor": "#16A34A",
  "contactPhone": "081-234-5678",
  "logoDataUri": "data:image/png;base64,...",
  "whiteLabelEnabled": true
}
```

### Paid plans with White-label enabled

Basic/Standard/Pro:
- `dormName`: current dorm identity
- `brandColor`: current normalized value หรือ `null`
- `contactPhone`: current value หรือ `null`
- `logoDataUri`: current canonical Data URI หรือ `null`
- `whiteLabelEnabled`: true

### Demo plan behavior

Demo ต้องยังแสดง identity ที่ตั้งตอน first setup:

```json
{
  "dormName": "ชื่อหอที่ตั้งตอนติดตั้ง",
  "brandColor": null,
  "contactPhone": null,
  "logoDataUri": null,
  "whiteLabelEnabled": false
}
```

เหตุผล:
- Demo setup identity ไม่ใช่ post-setup White-label mutation
- Demo ไม่ควร render paid-plan branding customization ที่อาจคงอยู่หลัง downgrade/plan switch

`billFooter` ไม่อยู่ใน public branding endpoint เพราะเป็น billing-document content ไม่จำเป็นต่อ Login/Public UI

## 11. Public Data Leak Boundary

`GET /api/public/branding` ต้องสร้าง response ด้วย explicit allowlist เท่านั้น ห้าม serialize settings row แล้วค่อยลบ field

ต้องไม่ส่งออก:
- PromptPay ID / PromptPay configuration
- LINE channel access token
- LINE channel secret
- LINE user/group IDs
- Google OAuth access token
- Google OAuth refresh token
- Google OAuth client credentials
- Google spreadsheet ID
- JWT secret
- password/password hash
- users/roles/permissions
- subscription/license private metadata
- backup/restore token or hashes
- `brand_logo_key` internal field name

Regression test ต้องใส่ sentinel secret values ใน row/fixtures แล้ว assert ว่าไม่ปรากฏใน serialized public response

## 12. Cloudflare Pages + Express Parity

Public branding และ logo mutation contract ต้องมี behavior เท่ากันใน runtime ที่ระบบรองรับ

Cloudflare Pages:
- ใช้ D1 settings row จริง
- owner scoping ตาม Task 1

Express/VPS:
- ใช้ storage/settings abstraction เดิมของ runtime
- ต้องคืน response shape / error code เหมือน Pages

ห้ามเกิดกรณี Pages รองรับ logo แต่ Express silently ignore หรือ public endpoint shape ต่างกัน

หาก runtime บางเส้นทางของ current source fail-closed เพราะ D1-only requirement อยู่แล้ว ให้รักษา fail-closed semantics เดิมและทดสอบ contract ที่ runtime รองรับจริง ห้ามเพิ่ม fake persistence เพื่อให้ test ผ่าน

## 13. Error Contract

ใช้ error envelope เดิมของระบบ

### 400 VALIDATION_ERROR

ใช้กับ:
- missing `logoDataUri`
- logoDataUri ไม่ใช่ string
- malformed Data URI
- unsupported MIME
- SVG
- invalid base64
- MIME/magic-byte mismatch
- decoded zero bytes
- decoded size > 307,200 bytes

ห้าม echo base64 payload เต็มกลับใน error message/log

### 401

unauthenticated mutation request

### 403 Authorization

staff/caretaker หรือ role ที่ไม่ได้รับสิทธิ์ owner-level

### 403 PLAN_REQUIRED

owner/super_admin ของ plan ที่ `whiteLabel=false` เช่น Demo

### 500

unexpected persistence/runtime failure โดยไม่ leak secret/data URI payload ใน error

## 14. Logging / Privacy

ห้าม log:
- full Data URI
- base64 payload
- decoded binary

ถ้าจำเป็นต้อง log diagnostic ให้ใช้ metadata เท่านั้น เช่น:
- mime
- sizeBytes
- ownerId
- action (`set_logo` / `delete_logo`)

Task 2 ไม่บังคับเพิ่ม audit action ใหม่ถ้า current settings mutation path ไม่มี audit contract; ห้ามขยาย audit scope โดยไม่จำเป็น

## 15. Backup / Restore Compatibility

Task 2 ไม่เปลี่ยน `.dormbackup` schemaVersion

ยังคง:
- `formatVersion=1`
- `schemaVersion=7`

Logo ยังไม่ portable ใน Task 2:
- export ไม่ส่ง `brand_logo_key`
- export ไม่ส่ง `logoDataUri`
- restore v7 preserve current logo
- restore v6 preserve current logo

เหตุผล: Data URI อาจสูงถึง 300 KiB และ portability policy ของ logo ควรถูกออกแบบแยกจาก safe textual settings

Regression tests ต้องยืนยันว่า Task 2 ไม่ทำให้ backup exporter เริ่มดึง logo เข้า archive โดย accident

## 16. Package Behavior

Plan entitlement ไม่เปลี่ยนจาก Task 1:

| Plan | whiteLabel | Set/Delete Logo | Public custom branding |
|---|---:|---:|---:|
| Demo | false | blocked | dormName only, customization masked |
| Basic | true | allowed | allowed |
| Standard | true | allowed | allowed |
| Pro | true | allowed | allowed |

PromptPay matrix ไม่เปลี่ยน

Generated Demo/Basic/Standard/Pro ต้องมาจาก One Master เดียว ห้าม patch package ZIP แยกกัน

## 17. Testing Strategy

### Validator tests

ต้องมี RED→GREEN cases อย่างน้อย:
- valid PNG
- valid JPEG
- valid WebP
- invalid base64
- SVG rejected
- unsupported MIME rejected
- PNG header + JPEG bytes rejected
- empty decoded payload rejected
- exactly 307,200 bytes allowed ถ้า format bytes valid
- >307,200 bytes rejected
- canonical re-encode deterministic

### Auth/API tests

- Basic owner PUT logo succeeds
- Standard owner succeeds
- Pro owner succeeds
- Demo owner -> 403 PLAN_REQUIRED
- staff/caretaker -> 403 auth error not PLAN_REQUIRED
- DELETE same gate matrix
- GET settings exposes `brandLogoUrl` but never `brandLogoKey`

### Public branding tests

- unauthenticated GET succeeds
- paid plan exposes allowlisted customization
- Demo exposes dormName but masks logo/color/contact
- `billFooter` absent
- sentinel PromptPay/LINE/Google secrets absent
- internal brand_logo_key field name absent

### Backup regression

- schemaVersion remains 7
- logo absent from export
- v7 restore preserves current logo
- v6 restore preserves current logo

### Package parity

- generated packages share identical public branding/logo implementation
- plan-generated entitlement differences only follow the approved matrix

## 18. Real D1 Smoke Exit Gate

Task 2 จะไม่ถือว่า complete จนกว่าจะผ่าน real Cloudflare D1 smoke จาก immutable candidate

Smoke อย่างน้อย:

### Pro
1. create temporary D1 + Pages
2. apply migrations including `0006_add_white_label_settings.sql`
3. setup owner
4. set valid PNG logo
5. GET authenticated settings -> `brandLogoUrl` present
6. GET public branding unauthenticated -> logo/color/contact/dormName correct
7. seed sentinel PromptPay/LINE/Google values -> public response must not leak
8. export backup -> logo absent, schemaVersion 7
9. mutate logo
10. restore v7 backup -> current logo preserved
11. validate/restore v6 backup -> current logo preserved
12. delete logo -> public branding logo null

### Demo
1. first setup with dormName succeeds
2. public branding returns dormName
3. public logo/color/contact masked/null
4. PUT logo -> 403 PLAN_REQUIRED
5. DELETE logo -> 403 PLAN_REQUIRED
6. backup export remains allowed and schemaVersion 7

### Cleanup
Temporary Pages and D1 resources ต้องถูก delete ด้วย exit 0 แม้ smoke fail

## 19. Non-goals

Task 2 ไม่ทำ:
- UI upload component
- crop/resize/compress image
- pixel dimension validation
- R2 object storage
- remote image URL fetching
- PWA icon generation
- favicon replacement
- dashboard/login visual rendering beyond API contract
- bill rendering
- logo portability inside backup
- PromptPay entitlement changes
- package-plan restructuring

## 20. Acceptance Criteria

Task 2 ผ่านเมื่อ:
1. no new migration is added
2. `brand_logo_key` stores only validated canonical PNG/JPEG/WebP Data URI written through logo API
3. decoded logo size is capped at 307,200 bytes
4. MIME and magic bytes are both validated
5. SVG is rejected
6. owner/super_admin + whiteLabel entitlement gates mutations correctly
7. Demo mutations return `PLAN_REQUIRED`
8. public branding is unauthenticated and explicit-allowlist only
9. Demo keeps first-setup dormName but masks paid White-label customization
10. no PromptPay/LINE/Google/credential/private subscription data leaks through public branding
11. authenticated settings exposes `brandLogoUrl`, never internal key
12. backup stays schemaVersion 7 and logo remains non-portable/preserved on v6/v7 restore
13. One Master package parity passes
14. tests, lint, Cloudflare types, Pages build and package release gates pass
15. real Pro + Demo D1 smoke passes
16. temporary Cloudflare resources are cleaned up successfully

## 21. Implementation Sequence

หลัง written spec ได้รับอนุมัติ ให้สร้าง implementation plan แบบ TDD โดยแยก reviewable tasks ประมาณนี้:
1. Logo Data URI validator
2. Logo mutation service/API + role/plan gate
3. Authenticated Settings projection
4. Public branding allowlist service/API
5. Express/Pages parity
6. Backup/logo-preservation regressions
7. Package parity/release tests
8. Immutable candidate + full gate + real D1 smoke

ทุก task ต้องทำ RED → GREEN → review ก่อนขยับ task ถัดไป
