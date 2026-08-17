# V15 Task 3 — Theme Runtime + Brand Tokens — สถานะสุดท้าย

สถานะ: **PASS — Task 3 verified complete**

ขอบเขต: Task 3 ครอบคลุมเฉพาะ **Theme Runtime + Brand Tokens** ของ V15 White-label เท่านั้น ยังไม่ใช่การปิด V15 White-label ทั้งหมด

## สิ่งที่ตรวจผ่าน

- `ThemeProvider` อยู่ระดับ root และครอบทุก surface: Login, Main App, Tenant Portal และ LINE Registration
- โหลด public branding แบบ unauthenticated จาก `/api/public/branding` ผ่าน runtime กลางเพียงจุดเดียว
- branding bootstrap มี timeout คงที่ 3000 ms และ fallback เป็น `#1DB954`
- runtime ใช้ brand tokens 4 ตัว:
  - `--brand-primary`
  - `--brand-primary-hover`
  - `--brand-soft`
  - `--brand-contrast`
- semantic status tokens แยกจากสีแบรนด์และไม่ถูก derive จาก `brandColor`
- พฤติกรรม light/dark เดิมยังผ่าน regression
- neutral branding boot gate ป้องกันการ render surface ก่อน branding bootstrap resolve/fallback
- Demo / Basic / Standard / Pro มี Task 3 runtime source ตรงกันแบบ byte-identical ในไฟล์ที่กำหนด
- Task 3 ไม่เพิ่ม migration หลัง `0006_add_white_label_settings.sql`
- Task 3 ไม่เปลี่ยน backend API contract และไม่เปลี่ยน backup format/schema contract

## Immutable source/release gate

ฐานต้นทาง: V15 Task 2 immutable artifact ID `9285398323`

Task 2 Master SHA-256 ที่ใช้ตรวจใน Task 3 CI:

`5ff63b6cddc1ff0c422f6a4ee443ae847b4440a5e458f0c8e363ffa74c7b4207`

Task 8 Production Gate:

- Run: `32053615361`
- Job: `95458618909`
- Result: `SUCCESS`
- Gate fix commit: `b0deae1c16b3cc68f126c1be67771f9065c4161f`
- Master artifact SHA-256:
  `ea70213d83f87eaacfb9002beee1bc5b46bdc3aea158d3bf94d626ab5c0d53c2`

Candidate package SHA-256:

- Basic: `2b693acd643be0a2d989edc188dcce3695ca795fcaf55ac0399668e8e4429262`
- Demo: `622872dd3754fd0458619d105e234040bceb6f50447ab5b253dcbefca7309bd5`
- Pro: `aaca982474c0e09c989650e14fd6d37562742f506cb90d194408246139f3b3a2`
- Standard: `24ad93417734613fb2a7d3310e016a1f206937eb18a37c60d7ea10de42f458dd`

Immutable candidate artifact:

- Name: `v15-task3-candidate-pending-d1-smoke`
- Artifact ID: `9295620943`
- Digest: `sha256:27a31c04430d7bbf145b6f068bc6a94e05a6e7ceb010fdc20e075b4177de5a9a`

Gate ที่ผ่านรวมถึง focused Task 3 tests, backup regression, full test suite, TypeScript lint, Cloudflare types, Pages build, VPS build, PREVIEW generation, guarded CUSTOMER-READY builder, One Master package parity และ final static audit

## Real Cloudflare D1 + Browser Runtime Smoke

Task 9:

- Run: `32054046371`
- Job: `95459987127`
- Workflow commit: `369be0b2bec0fe01b75d0bfce1e0dfb00192afb3`
- Result: `SUCCESS`

Evidence artifact:

- Name: `v15-task3-d1-browser-smoke-evidence`
- Artifact ID: `9296735304`
- Digest: `sha256:b0392768516e970a55f6f6111df5503a40491ae5975b530d9ee98d3c8eb88af3`

สิ่งที่พิสูจน์บน Cloudflare จริง:

- Pro candidate ผ่าน Task 2 D1 regression smoke ทั้งชุดหลังเพิ่ม Task 3
- Demo candidate ผ่าน Task 2 Demo regression smoke ทั้งชุดหลังเพิ่ม Task 3
- Pro public branding ตั้ง `brandColor = #6D28D9` แล้ว headless browser เห็น runtime `--brand-primary: #6D28D9`
- Demo แม้ใน D1 จะใส่สีทดสอบไว้ แต่ public branding mask สีตาม entitlement และ browser ใช้ fallback `--brand-primary: #1DB954`
- branding boot gate resolve ก่อน app surface ปกติ
- temporary Pro/Demo Pages และ D1 resources ถูก cleanup สำเร็จทั้งหมด

## สิ่งที่ยังอยู่นอก Task 3

V15 White-label ยังเหลืองาน เช่น:

- Settings UI สำหรับแก้แบรนด์
- Live preview
- Logo client resize / UX
- การ migrate visual component เดิมให้ใช้ brand tokens อย่างกว้างขึ้น
- Login / logo visual integration แบบเต็ม
- Bill / PDF / JPG branding
- Tenant Portal visual branding

## Merge policy

Task 3 ยังอยู่บน branch `agent/v15-task1-white-label-contract` และ **ยังไม่ได้ merge เข้า `main`**
