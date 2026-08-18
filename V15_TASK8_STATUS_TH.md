# V15 Task 8 Status — Final Integration / Release Gate

สถานะ: **BLOCKED — ห้ามใช้ artifact ปัจจุบันเป็น CUSTOMER-READY สำหรับลูกค้า**

วันที่ตรวจ: 2026-08-18
Branch: `agent/v15-task1-white-label-contract`

## Production Release Gate

Production/Acceptance Gate ผ่านครบจาก immutable Task 7 lineage:

- Run: `32143345567`
- Source SHA: `c55367afa61227ea6fa09c501ec52f07933009a5`
- Source Task 7 artifact: `9317174783`
- Source digest: `sha256:2f475ac6daaae661442b3cb13b60b8d4ed82c74570c2e67ed70a8242bbbf0d3e`
- Pending-final-smoke artifact: `9326820971`
- Artifact digest: `sha256:25a402520dd01cb8c460a727208015b3dc06ad32c7a03dff90cc4f806d37f8b7`
- AC-01..AC-10 pre-release matrix: PASS
- Full tests/lint/Cloudflare types/Pages/VPS/package generation/four-plan package audit/parity/security/ZIP integrity: PASS
- Highest migration: `0006_add_white_label_settings.sql`

Verified final ZIP SHA-256 values:

- Master: `2d9a1a17bfc6a0e4da1edf0cda2fc4c9a488a2f5807bc16e36cabafea8aff231`
- Demo: `ad02052c10fb50eb4d48c13caa5cdc3e553a85b28689b4255a519a7c4d703946`
- Basic: `908a2147055a1e9b91f40f78b5f95a65ee41e0cdb54bca074a690a87a3ff0a57`
- Standard: `ab987a18f79f0ef3de0dd0fa8ef73e54f1de2df223c24060d33f818d53669af4`
- Pro: `5fe906c99f22a92325015b7800079af6d68b3c08f13d3285e7093791bccf1916`

## Final exact-byte Cloudflare smoke

Run `32144011609`, attempt 1, ใช้ exact artifact `9326820971` และ exact Pro/Demo ZIP SHA ด้านบน

ผล:

- exact artifact/manifest verification: PASS
- D1 creation/migration through `0006`: PASS
- Pages build/deploy: PASS
- edge readiness: PASS
- real owner/login: PASS
- Pro effective branding + Demo dormant-brand masking seed: PASS
- real occupied room + bill seed: PASS
- Pro Login/Desktop/Mobile app-shell smoke: PASS
- Demo Login/Desktop/Mobile masking smoke: PASS
- Pro Bill/JPG/Print-PDF smoke: **FAIL before BillInvoice opens**
- remaining Demo Bill and Tenant Portal final flows: skipped because workflow stopped after Pro Bill failure
- cleanup Pro Pages/D1 + Demo Pages/D1: PASS, all delete commands exit 0

Failure evidence artifact:

- artifact ID: `9327204405`
- digest: `5d9cc1de595aa1f6abcddd901597386f2effa90e9189b1d418e5dac0a04ea9d2`

## Root cause

นี่เป็น product race ไม่ใช่ Cloudflare propagation หรือ browser selector failure

Dashboard โหลด `dashboardData.unpaidRooms` และแสดงปุ่ม `ดูบิล` ได้ก่อนที่ global `bills` state จะโหลดเสร็จ

`src/App.tsx` มี flow:

```ts
const onViewBillById = (billId: number) => {
  const bill = bills.find(b => b.id === billId);
  if (bill) {
    setSelectedInvoice(bill);
  } else {
    fetch('/api/bills', { headers: getHeaders() })
      .then(res => res.json())
      .then(data => {
        const found = data.find((b: any) => b.id === billId);
        if (found) setSelectedInvoice(found);
      });
  }
};
```

แต่ Cloudflare API `/api/bills` ใช้ `successResponse(mapped)` และจึงคืน envelope:

```json
{
  "success": true,
  "data": [ ... ]
}
```

ดังนั้นเมื่อ race ทำให้เข้า fallback, `data` เป็น object ไม่ใช่ array และ `data.find(...)` โยน runtime error:

`TypeError: data.find is not a function`

Run `32144011609` บันทึก browser exception นี้โดยตรง และ BillInvoice ไม่ถูกเปิด

`fetchBills()` ใน App มี normalization ที่ถูกต้องอยู่แล้ว (`Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []`) แต่ fallback ใน `onViewBillById()` ยังไม่ใช้ contract เดียวกัน

## Release decision

V15 ยัง **ไม่ CUSTOMER-READY** และยังไม่ merge `main`

artifact `9326820971` เป็นเพียง `pending-final-cloudflare-smoke` และห้ามส่งลูกค้า

ต้องทำ bounded fix cycle สำหรับ Dashboard bill fallback, สร้าง immutable candidate ใหม่, rerun Production Release Gate และ rerun exact-byte final Cloudflare smoke ครบ Pro + Demo ก่อนเปลี่ยนสถานะเป็น CUSTOMER-READY
