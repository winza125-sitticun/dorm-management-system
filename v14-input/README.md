# V14 Task 12 Gate Input

อัปโหลดไฟล์ต่อไปนี้เข้ามาในโฟลเดอร์นี้โดยใช้ชื่อเดิมทุกตัวอักษร:

`dorm-management-system-master-v14-REVIEW-R2.zip`

SHA-256 ที่ workflow ยอมรับ:

`32f89c1f27ad90b4d38515822560646d004519310948099d70812a46264c3830`

เมื่อ ZIP ถูก push เข้า branch `agent/v14-task12-production-gate` GitHub Actions จะรัน Node.js 22, `npm ci`, full `npm test`, `npm run lint`, `npm run check:cloudflare-types:master`, `npm run build:pages`, PREVIEW generation และ guarded `npm run packages:release`.

ผลจาก release builder ยังถือเป็น candidate ที่รอ temporary Cloudflare D1 end-to-end smoke restore ก่อนอนุมัติ Production/CUSTOMER-READY ขั้นสุดท้าย.
