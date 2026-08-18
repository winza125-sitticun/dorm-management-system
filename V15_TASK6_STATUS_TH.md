# V15 Task 6 Status — Bill / PDF / JPG Branding Integration

สถานะ: **PASS — Task 6 verified complete**

วันที่ตรวจ: 2026-08-18
Branch: `agent/v15-task1-white-label-contract`

## Scope ที่ปิดแล้ว

Task 6 ทำให้ `BillInvoice` ใช้ effective white-label branding snapshot เดียวกันสำหรับหน้าพรีวิว, Print/PDF และ JPG โดยไม่เพิ่ม API, D1 schema, backup schema หรือ migration ใหม่

- ชื่อหอใช้ effective runtime `dormName`
- brand surfaces ของบิลใช้ effective runtime `brandColor`
- โลโก้ใช้ effective runtime `logoDataUri`
- โลโก้โหลดเสีย fallback เป็น `Home` icon โดย export ไม่ล้ม
- เบอร์ติดต่อและ `billFooter` แสดงเฉพาะเมื่อ white-label entitlement เปิด
- Demo เก็บ dormant paid branding ได้ใน D1 แต่ BillInvoice ไม่เผย logo/contact/footer และใช้ fallback brand `#1DB954`
- JPG ยังคง export จาก `printAreaRef.current` ของ BillInvoice จริง
- Print/PDF CSS ใช้ runtime brand color และ `print-color-adjust: exact`
- semantic colors ของค่าไฟ/ค่าน้ำ/รายการอื่นยังคงแยกจาก brand color
- PromptPay/LINE semantic/payment colors ไม่ถูกเปลี่ยนเป็น dorm brand
- migration สูงสุดยังเป็น `d1-migrations/0006_add_white_label_settings.sql`

## TDD / implementation contract

Task 5 immutable master ถูกใช้เป็นฐาน และพิสูจน์ RED ก่อน apply Task 6 patch จากนั้น GREEN ผ่าน

- deterministic patch SHA-256: `6721e531c1e8798f5ac68fdbd5b6e1074bf5e4e3f21eadcfb9e97459fc53ddcc`
- `src/components/BillInvoice.tsx` หลัง patch: `eb4678e87fc1bd5aa3bd891c7ae0bd89095b28f410951ff91cc86a4825a5cb97`
- `src/utils/billBranding.ts`: `e7d2a31d71cd8615425dc50dec6b0065ba6a81523cf6fecd8a9a40cbac4acaaa`

## Production Gate

Run: `32111815554`

- source SHA: `a2ef355166d83c71aeda6d2a1d3e59078ed7d8b6`
- source Task 5 artifact: `9309202126`
- source Task 5 artifact SHA-256: `88fd5b025071db5437c956a731bf721d9c62d471af5853ed92d8ff7b041b4bc0`
- result: `success`

Gate ผ่าน:

- pinned source / artifact / patch verification
- RED on immutable Task 5
- deterministic Task 6 patch
- GREEN Task 6 contracts
- focused bill-branding tests
- runtime theme/branding regression
- backup regression
- full test suite
- TypeScript lint
- Cloudflare types
- Pages production build
- VPS production build
- package generation / builder / release gate
- One Master + 4-plan package parity
- migration guard

## Immutable Task 6 candidate

Artifact: `9315194299`

- artifact digest: `sha256:f0bec7ca2f263938df722e9eca3d0fa7a649beee09191dc14dea15bc6d11447c`
- Master ZIP SHA-256: `309b987c198562528518b5ca71a7eb85751740fabb224c3b31b69107371a2d1a`
- Basic ZIP: `9f02ffca3e51df5ccd50dfffc9edf58b329940e1f7b9a243ebb08ee095dfb11f`
- Demo ZIP: `4dac28793ad338c8cfe16c9adeb240cda7d928c1627b1bd092c7957840dacd2c`
- Pro ZIP: `6b37ff8db9ba2cf501723ec9543c951f9def366fae9cb339c260b41fa692f121`
- Standard ZIP: `70799f64112476964f6c06a942f23295add09263682340677d566454052e99e1`

ทั้ง 4 plans มี migration สูงสุด `0006_add_white_label_settings.sql`

## Cloudflare D1 + Pages + Browser Export Gate

Final passing run: `32114170191`, attempt `2`

- source SHA: `016db1816fe41f2baa9be2f6bdf9a259b858bd6a`
- source artifact: `9315194299`
- source artifact digest: `sha256:f0bec7ca2f263938df722e9eca3d0fa7a649beee09191dc14dea15bc6d11447c`
- `assert_smoke=success`
- evidence artifact: `9316297574`
- evidence digest: `sha256:d52c2b4913a15b775cfb618481ca6aac8670e4e1c9782440cf7789473aec0d90`

### Pro evidence

- effective dorm: `Task 6 Pro Dorm`
- effective brand: `#6D28D9`
- logo visible: PASS
- bill footer visible: PASS
- contact phone visible: PASS
- table header + total box use runtime brand: PASS
- semantic amber / blue / purple preserved: PASS
- JPG generated: PASS (`bill-room-T6-PRO-101-2026-08.jpg`, data URL length 310615)
- Print/PDF callback + runtime color + exact color adjust: PASS
- broken-logo fallback exercised and visible: PASS

### Demo evidence

- effective dorm: `Task 6 Demo Dorm`
- effective brand: `#1DB954`
- dormant paid logo masked: PASS
- dormant paid footer masked: PASS
- dormant paid contact phone masked: PASS
- table header + total box use effective fallback brand: PASS
- semantic amber / blue / purple preserved: PASS
- JPG generated: PASS (`bill-room-T6-DEMO-101-2026-08.jpg`, data URL length 303715)
- Print/PDF callback + fallback color + exact color adjust: PASS

### Cleanup

- Pro Pages exit: `0`
- Pro D1 exit: `0`
- Demo Pages exit: `0`
- Demo D1 exit: `0`

## Explicit boundaries

Task 6 complete **ไม่ได้หมายความว่า V15 White-label ทั้งเฟส complete**

ยังไม่ทำใน Task 6:

- Tenant Portal branding / public portal polish (Task 7)
- V15 full acceptance matrix + final release integration gate (Task 8)
- merge เข้า `main`
- `CUSTOMER-READY` สำหรับ V15

ดังนั้นสถานะที่ถูกต้องคือ **Task 6 PASS / V15 ยังไม่ CUSTOMER-READY**
