# V15 Task 1 — White-label Schema + Plan Entitlements + Settings Contract

วันที่: 2026-08-17
สถานะ: Design approved for written-spec review
ฐานงาน: V14 CUSTOMER-READY, branch `agent/v14-task12-production-gate`, head `9fe6b3619e4fb7045866ce161ffece01e9a30979`
V14 source/release gate: run `31980850645` = PASS
V14 real D1 smoke: run `31990279000`, attempt 2 = PASS

## 1. เป้าหมาย

Task 1 วางฐานข้อมูล สิทธิ์แพ็กเกจ และ API contract สำหรับ White-label โดยยังไม่ทำ UI theme rendering, การอัปโหลดโลโก้จริง, หรือการเปลี่ยนหน้าบิลเต็มรูปแบบ

White-label ใน Task 1 หมายถึงการตั้งค่าแบรนด์ของหอพักต่อ owner ได้แก่:
- ชื่อหอพัก (`dormName`) — ใช้ field เดิม
- สีแบรนด์ (`brandColor`)
- เบอร์ติดต่อหอพัก (`contactPhone`)
- ข้อความท้ายบิล (`billFooter`)
- สถานะ/ตัวอ้างอิงโลโก้สำหรับ Task อัปโหลดภายหลัง

PromptPay ยังคงใช้ field และ entitlement เดิมของ V14 และไม่ถูกผูกเข้ากับ `whiteLabel` entitlement ใน Task 1 เพื่อไม่ทำลาย package differentiation เดิมโดยไม่ตั้งใจ

## 2. ขอบเขตที่ไม่ทำใน Task 1

ไม่รวม:
- UI สำหรับเลือกสี/อัปโหลดโลโก้
- การเก็บ binary/logo จริง
- การ render logo/color ใน Dashboard/Login/Tenant Portal
- การ render `billFooter` ในบิล
- การเปลี่ยน PWA icon/manifest icon
- การเปลี่ยนสิทธิ์ PromptPay เดิม
- การ refactor Settings ทั้งระบบนอกส่วนที่จำเป็นต่อ contract นี้

## 3. Plan Entitlements

เพิ่ม `whiteLabel` เป็น `PlanFeature` ใหม่ใน `src/constants/planEntitlements.ts`

Matrix ที่อนุมัติ:

| Plan | whiteLabel |
|---|---|
| Demo | false |
| Basic | true |
| Standard | true |
| Pro | true |

กติกา:
- `whiteLabel` เป็น feature boolean เดียวใน V15 Task 1
- ยังไม่แยก `whiteLabelLogo`, `whiteLabelTheme`, `whiteLabelContact`
- UI ภายหลังอ่าน entitlement เดียวแล้วเปิด/ปิดชุด White-label
- `settings`, `promptPay`, `lineIntegration`, `googleSheets` และ entitlement อื่นคง semantics เดิม

### PromptPay clarification

V14 ปัจจุบันกำหนด `promptPay` แยกจาก White-label:
- Demo: true
- Basic: false
- Standard: true
- Pro: true

Task 1 จะไม่เปลี่ยน matrix นี้ แม้ Basic จะได้ `whiteLabel=true` เพราะ PromptPay เป็น payment capability เดิม ไม่ใช่ brand capability

## 4. Settings Data Model

เพิ่ม migration แบบ additive เท่านั้น: `d1-migrations/0006_add_white_label_settings.sql`

เพิ่ม column ใน `settings`:

```sql
ALTER TABLE settings ADD COLUMN brand_logo_key TEXT;
ALTER TABLE settings ADD COLUMN brand_color TEXT;
ALTER TABLE settings ADD COLUMN contact_phone TEXT;
ALTER TABLE settings ADD COLUMN bill_footer TEXT;
```

หลักการ:
- ทุก column ใหม่ nullable เพื่อให้ฐาน V14 เดิม migrate ได้โดยไม่ต้อง backfill
- ไม่ rename/drop field เดิม
- ไม่เพิ่ม `white_label_enabled` ลง DB เพราะสิทธิ์ derived จาก subscription plan
- `brand_logo_key` เป็น internal, server-managed opaque reference; client ปกติห้ามกำหนดผ่าน `PUT /api/settings`
- Task อัปโหลดโลโก้ภายหลังเป็นเจ้าของ lifecycle ของ `brand_logo_key`
- API จะ expose `brandLogoUrl` แบบ read-only เมื่อมี asset พร้อมใช้งาน; Task 1 อาจคืน `null` จนกว่า logo service ถูกสร้าง

### Fallback behavior

เมื่อ field ใหม่เป็น `NULL`:
- `dormName`: fallback เดิม `หอพักของฉัน`
- `brandColor`: UI ภายหลังใช้สีเดิมของแอปเป็น fallback โดยไม่เขียนค่า default ลง DB
- `contactPhone`: ไม่มีข้อมูลติดต่อ
- `billFooter`: ไม่มีข้อความท้ายบิล
- `brandLogoUrl`: `null`

การไม่ backfill สี/โลโก้ช่วยให้ลูกค้า V14 อัปเกรดแล้วหน้าตาไม่เปลี่ยนจากค่า hard-coded เดิมจนกว่าจะตั้ง White-label

## 5. TypeScript Settings Contract

ขยาย `Settings` type ด้วย:

```ts
brandColor?: string | null;
contactPhone?: string | null;
billFooter?: string | null;
brandLogoUrl?: string | null;   // read-only API projection
whiteLabelEnabled?: boolean;    // derived from plan
```

`brandLogoKey` ไม่ expose ต่อ frontend ทั่วไป

## 6. GET /api/settings Contract

`GET /api/settings` ยังคง authenticated และ owner-scoped ผ่าน `getEffectiveUserId()` ตาม V14

Response ต้องคง field เดิมทั้งหมดที่ client ใช้อยู่ และเพิ่ม:

```json
{
  "brandColor": null,
  "contactPhone": null,
  "billFooter": null,
  "brandLogoUrl": null,
  "whiteLabelEnabled": true
}
```

`whiteLabelEnabled` คำนวณจาก:

```ts
hasPlanFeature(subscriptionPlan, 'whiteLabel')
```

Demo ยังอ่าน response ได้เพื่อให้ UI แสดง preview/default state แต่ `whiteLabelEnabled=false`

ห้าม expose:
- `brand_logo_key`
- LINE secret/token
- OAuth credentials
- subscription private metadata ที่ไม่เคย expose มาก่อน

## 7. PUT /api/settings Contract

Endpoint เดิมคงอยู่เพื่อ backward compatibility

### White-label writable fields ผ่าน endpoint นี้

- `dormName`
- `brandColor`
- `contactPhone`
- `billFooter`

### Read-only/server-managed field

- `brandLogoUrl`
- `brandLogoKey`

ถ้าส่ง field read-only มาเพื่อพยายามเขียน ให้ตอบ validation error แทนการ silently save

### Authorization

การเปลี่ยน White-label field ต้องผ่านทั้งสองเงื่อนไข:
1. actor เป็น `owner` หรือ `super_admin`
2. owner plan มี `whiteLabel=true`

ผลลัพธ์:
- Demo owner/super_admin พยายามเปลี่ยน White-label -> HTTP 403 + `PLAN_REQUIRED`
- Basic/Standard/Pro owner/super_admin -> อนุญาต
- staff/caretaker แม้มี `manage_settings` -> ห้ามเปลี่ยน White-label และตอบ 403 authorization error ที่ไม่ใช้ `PLAN_REQUIRED`

### Diff-based gate

Gate ต้องตัดสินจาก “ค่าที่เปลี่ยนจริง” หลัง normalization ไม่ใช่แค่การมี key ใน request

เหตุผล: Settings form ปัจจุบันส่ง full payload; หาก Demo ส่ง `dormName` เดิมมาพร้อมการแก้ setting อื่น จะต้องไม่โดน `PLAN_REQUIRED` เพียงเพราะ key `dormName` อยู่ใน payload

ตัวอย่าง:
- Demo ส่ง `dormName` เท่าเดิม + เปลี่ยน non-white-label setting ที่ยังอนุญาตตามกติกาเดิม -> ไม่โดน white-label gate
- Demo เปลี่ยน `dormName` จากค่าเดิม -> 403 `PLAN_REQUIRED`

Task 1 ไม่เปลี่ยน authorization semantics ของ setting อื่นนอก White-label

### First setup bootstrap exception

`POST /api/setup/init` ของ V14 รับ `dormName` ตอนติดตั้งครั้งแรก และ generated package กำหนด `subscription_plan` ผ่าน schema default ของแพ็กเกจ

เพื่อไม่ทำลาย setup flow เดิม:
- ทุกแพ็กเกจ รวม Demo ยังคงกำหนด `dormName` ครั้งแรกใน `/api/setup/init` ได้
- ถือเป็น bootstrap identity ไม่ใช่ post-setup White-label mutation
- validation ของ `dormName` ใน setup ต้องใช้ข้อกำหนดเดียวกัน: trim, 1..120 ตัวอักษรถ้ามีค่า
- หลัง setup แล้ว การเปลี่ยน `dormName` ผ่าน `PUT /api/settings` จึงอยู่ใต้ `whiteLabel` gate
- Demo จึงตั้งชื่อหอได้ตอนติดตั้งครั้งแรก แต่แก้ White-label ภายหลังไม่ได้

Task 1 ต้องมี regression test เพื่อยืนยันว่า Demo first setup ยังสำเร็จ

## 8. Validation + Normalization

### dormName
- trim
- ความยาว 1..120 ตัวอักษร
- plain text เท่านั้น

### brandColor
- optional/nullable
- `""` normalize เป็น `null`
- ถ้ามีค่า รับเฉพาะ `#RRGGBB`
- regex: `^#[0-9A-Fa-f]{6}$`
- canonical storage: uppercase เช่น `#1DB954`

### contactPhone
- optional/nullable
- trim
- `""` normalize เป็น `null`
- ยาวสูงสุด 32 ตัวอักษร
- รองรับเลข, space, `+`, `-`, `(`, `)`, `.`
- ไม่พยายามบังคับรูปแบบประเทศใดประเทศหนึ่ง

### billFooter
- optional/nullable
- trim
- `""` normalize เป็น `null`
- สูงสุด 500 ตัวอักษร
- เก็บเป็น plain text ไม่รองรับ HTML

### logo fields
- client ห้าม set `brandLogoKey`/`brandLogoUrl` ผ่าน Settings PUT
- MIME/size/dimensions validation เป็น scope ของ Task อัปโหลดโลโก้ภายหลัง

## 9. Backup / Restore Compatibility

V14 backup invariants ต้องยังคงอยู่:
- archive format `dorm-backup`
- `formatVersion=1`
- owner scope/hash/count validation
- integrations/secrets ไม่ถูก export
- restore ไม่เขียนทับ current LINE/Google/subscription state

### V15 schema version

เมื่อ migration `0006` ถูกเพิ่ม:
- export ใหม่ใช้ `schemaVersion=7`
- `formatVersion` ยังคง `1`

### Safe white-label settings ใน V15 backup

เพิ่มใน safe settings ของ schema v7:
- `brandColor`
- `contactPhone`
- `billFooter`

`dormName` มีอยู่แล้ว

ไม่ export `brandLogoKey` ใน Task 1 เพราะเป็น non-portable asset reference และไม่มี binary/logo payload ใน `.dormbackup` เวอร์ชันนี้

### Restore V14 backup into V15

V15 ต้องยังรับ backup schemaVersion 6 ที่สร้างจาก V14

ลำดับ:
1. validate v6 archive/hash/counts ด้วย schema v6 เดิม
2. หลัง validation สำเร็จ ค่อย normalize ไป internal V15 restore model
3. field White-label ใหม่ที่ไม่มีใน v6 ให้ “preserve current value” แทนการล้างเป็น null
4. LINE/Google/subscription preservation เดิมยังทำเหมือน V14

### Restore V15 backup

schemaVersion 7 restore:
- restore `dormName`, `brandColor`, `contactPhone`, `billFooter` จาก backup
- preserve current `brandLogoKey` จนกว่า logo portability contract จะถูกกำหนดใน Task โลโก้
- preserve integrations/secrets/subscription เหมือน V14

## 10. Error Contract

ใช้รูปแบบ error ที่มีอยู่ใน V14

Plan gate:

```json
{
  "success": false,
  "error": {
    "code": "PLAN_REQUIRED",
    "message": "..."
  }
}
```

สถานะ HTTP: `403`

Validation error:
- HTTP 400
- ต้องระบุ field/message โดยไม่ echo secret

Authorization error ของ staff:
- HTTP 403
- ไม่ masquerade เป็น `PLAN_REQUIRED`

## 11. Package Contract

`package-plans/*.json` ต้องสะท้อน White-label entitlement ใหม่อย่างสอดคล้อง:
- Demo: แสดงว่า White-label ปรับแต่งจริงไม่ได้
- Basic: White-label เปิดใช้
- Standard/Pro: สืบทอด/เปิดใช้ White-label

Builder/parity tests ต้องยืนยันว่า generated Demo/Basic/Standard/Pro ไม่เปลี่ยน entitlement matrix ระหว่าง package generation

## 12. Tests ที่ Task 1 ต้องมี

### Plan entitlement tests
- `whiteLabel=false` สำหรับ Demo
- `whiteLabel=true` สำหรับ Basic/Standard/Pro
- existing entitlement เช่น PromptPay ไม่เปลี่ยนโดย accident

### Settings validator tests
- valid/invalid HEX
- `brandColor` normalize uppercase
- contactPhone max/allowed chars
- billFooter max 500
- dormName max 120
- reject client write to logo-managed fields

### Settings API guard tests
- Basic/Standard/Pro owner เปลี่ยน White-label ได้
- Demo เปลี่ยน White-label -> 403 `PLAN_REQUIRED`
- Demo ส่ง white-label field ค่าเดิมใน full payload -> ไม่โดน gate
- staff ที่มี `manage_settings` เปลี่ยน White-label -> 403 authorization
- non-white-label settings ไม่ถูก `whiteLabel` gate โดยผิดพลาด
- GET ไม่ expose logo key/LINE/OAuth secret

### Setup regression tests
- Demo first setup พร้อม `dormName` ยังสำเร็จ
- setup `dormName` trim/limit ถูกต้อง
- หลัง setup Demo เปลี่ยน `dormName` ผ่าน Settings ไม่ได้

### Migration/schema tests
- V14 settings row migrate ได้โดยไม่ต้อง backfill
- new columns nullable
- existing data preserved

### Backup tests
- v7 export รวม brandColor/contactPhone/billFooter
- v7 export ไม่รวม brandLogoKey
- v6 archive ยัง validate/restore บน V15 ได้
- v6 restore preserve current new White-label values
- v7 restore คืนค่า safe White-label fields
- integration/subscription preservation regression ยังผ่าน

### Release regression
หลัง Task 1 implementation ต้องผ่านอย่างน้อย:
- `npm test`
- `npm run lint`
- `npm run check:cloudflare-types:master`
- `npm run build:pages`
- package parity/builder tests

## 13. Security / Privacy Rules

- White-label contract ห้ามรับ/คืน credentials
- `brandLogoKey` เป็น internal identifier ไม่ใช่ public client-controlled path
- `billFooter` เป็น plain text เพื่อลด HTML/script injection surface
- ไม่ยอมให้ arbitrary remote logo URL ผ่าน Settings PUT
- owner scoping เดิมต้องคงอยู่
- Demo gate fail-closed เมื่อมีการเปลี่ยน White-label จริงหลัง setup

## 14. Migration / Upgrade Safety

- migration additive only
- existing V14 customer D1 ต้องอัปเกรดได้โดยไม่ลบข้อมูล
- nullable new fields = current visual behavior remains unchanged
- V14 backup schema v6 ยัง restore ได้หลัง upgrade
- no secret/credential migration
- plan expiry/revocation ไม่ลบ White-label data; entitlement มีผลต่อการแก้ไข/การแสดง control ตาม product rules ไม่ใช่การ delete ค่า

## 15. Task 1 Definition of Done

Task 1 ถือว่าจบเมื่อ:
1. `whiteLabel` entitlement matrix ตรง Demo=false, Basic/Standard/Pro=true
2. migration 0006 additive และ schema/type contract ตรงกัน
3. GET settings expose derived White-label fields โดยไม่ leak internal/secret fields
4. PUT settings ใช้ diff-based owner/super_admin + plan gate สำหรับ White-label
5. Demo first setup ยังตั้ง `dormName` ครั้งแรกได้โดยไม่ทำให้ setup flow พัง
6. validation ครบตาม contract
7. backup v7 รองรับ safe White-label fields และยัง restore v6 ได้
8. package metadata/parity สอดคล้อง
9. tests/lint/Cloudflare types/build ผ่าน
10. ไม่มีการทำ UI/logo upload/theme rendering เกิน scope ของ Task 1

## 16. Design Decisions Locked

- Approach: single `whiteLabel` entitlement
- Matrix: Demo=false, Basic=true, Standard=true, Pro=true
- PromptPay remains independent existing entitlement
- First setup may set initial `dormName` on every plan; post-setup edits are entitlement-gated
- No persisted `whiteLabelEnabled`
- Logo reference is server-managed and not writable via Settings PUT
- DB migration additive/nullable
- White-label authorization uses diff-based gate
- Backup formatVersion remains 1; V15 export schemaVersion becomes 7; V15 restore remains backward-compatible with V14 schemaVersion 6
