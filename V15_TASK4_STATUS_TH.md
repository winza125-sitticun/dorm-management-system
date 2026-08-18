# V15 Task 4 — White-label Settings UI + Live Preview — สถานะสุดท้าย

สถานะ: **PASS — Task 4 verified complete**

ขอบเขต: Task 4 ครอบคลุม **White-label Settings UI + Live Preview + Logo mutation UX + post-save runtime refresh** บนฐาน V15 Task 3 เท่านั้น ยังไม่ใช่การปิด V15 White-label ทั้งหมด และยังไม่ใช่ CUSTOMER-READY release.

## สิ่งที่ตรวจผ่าน

- Settings มี White-label section แบบ controlled สำหรับชื่อหอ สีแบรนด์ เบอร์โทร ข้อความท้ายบิล และโลโก้
- Live preview ใช้ effective branding ตาม entitlement และไม่แก้ root CSS variables ก่อน save
- Demo ถูก mask paid branding: ใช้ default `#1DB954`, ไม่แสดง paid logo/contact และ White-label edit ถูก gate
- PromptPay entitlement เดิมยังแยกจาก White-label entitlement
- Logo mutation ใช้ endpoint เดิม `PUT /api/settings/logo` และ `DELETE /api/settings/logo`
- client preflight รองรับ PNG/JPEG/WebP และ server validation ยังเป็น authoritative
- SVG, invalid base64, MIME/magic mismatch และ logo เกิน 307,200 bytes ถูก reject
- `brandLogoUrl` ไม่ถูกส่งใน `PUT /api/settings`
- หลัง settings/logo mutation ระบบ refresh canonical settings และ runtime branding โดย manual refresh failure ไม่บังคับ fallback ทับ branding ที่ใช้งานอยู่
- public branding เป็น unauthenticated safe allowlist และไม่เปิด bill footer/ข้อมูลลับ
- Backup/Restore regression ยังคงผ่าน และ logo remains non-portable ตาม contract เดิม
- One Master candidate สร้าง Demo / Basic / Standard / Pro จาก source เดียว
- ไม่มี migration หลัง `0006_add_white_label_settings.sql`

## Immutable Task 4 Production Gate

Workflow: `V15 Task 4 Production Gate`

- Run: `32091662960`
- Job: `95574886563`
- Result: `SUCCESS`
- Source SHA: `5da9ada9b218c706d6a3e2eee38901df26fcf993`
- Evidence pointer: `v15-task4-evidence/production-gate-latest.txt`

Gate ผ่านครบ:

- immutable Task 3 source verification
- Task 4 patch/source assembly
- focused Task 4 contracts
- Theme regression
- Backup regression
- full test suite
- TypeScript lint
- Cloudflare types
- Pages production build
- VPS production build
- PREVIEW generation
- guarded CUSTOMER-READY builder policy
- One Master + package static parity audit

Immutable candidate artifact:

- Name: `v15-task4-candidate-pending-d1-browser-smoke`
- Artifact ID: `9308548139`
- Artifact digest: `sha256:9e6041d979edf8defbb7a300308049dda8a61fd3d73bf238b317d96f97a23097`

Master candidate SHA-256:

- Master: `e87dadb925cc5319a5db08409930277c3f31ae2a8479fd2168158782c9c47c11`

Candidate package SHA-256:

- Basic: `c136f13cd97c9ead61bb84214ad008e3914e2fbc77f3303e29009c0199c96e33`
- Demo: `917106edf7c1ac465e267c8e84ee65f55a14f298084e9722698dce1c24741296`
- Pro: `89bf93bee72a88f57d74376dd088d3b8cd64af359b11cd0915eb5880e0901f75`
- Standard: `1be7a7986761084173f68a6bd40f0519443f3cf79290f0dbe100b51388082136`

## Real Cloudflare Pro + Demo D1 / Pages / Browser Smoke

Workflow: `V15 Task 4 Cloudflare D1 Browser Smoke`

- Run: `32092158593`
- Job: `95576361236`
- Result: `SUCCESS`
- Run attempt: `1`
- Workflow/source SHA: `2852e220809920080bd29d8f7229d154c78f2a03`
- Source candidate artifact ID: `9308548139`
- Source candidate artifact digest: `sha256:9e6041d979edf8defbb7a300308049dda8a61fd3d73bf238b317d96f97a23097`
- Evidence pointer: `v15-task4-evidence/d1-browser-smoke-latest.txt`
- Evidence pointer result: `assert_smoke=success`

Smoke evidence artifact:

- Name: `v15-task4-d1-browser-smoke-evidence`
- Artifact ID: `9308737879`
- Digest: `sha256:b996bf6a632db4ff02bf3a9633ec669ac92000e7e170f9a7d9d946204355bece`

สิ่งที่พิสูจน์บน Cloudflare จริง:

- Pro D1 regression smoke: `overallPass=true`
- Demo D1 regression smoke: `overallPass=true`
- Pro public branding ใช้ `#6D28D9`, contact phone และ logo ตาม effective paid branding
- Demo มี dormant stored brand `#DC2626` แต่ public/effective branding ถูก mask และ browser ใช้ `--brand-primary: #1DB954`
- Headless browser ยืนยัน branding boot resolve และ runtime token ถูกต้อง
- Pro/Demo logo plan gate ทำงานตาม entitlement
- Backup v7/v6 regression และ owner login after restore ผ่าน
- Pro/Demo temporary Pages และ D1 cleanup สำเร็จทั้งหมด (`exit=0` ทั้ง 4 resources)

## Final Gate Decision

Task 4 ผ่านทั้ง immutable production candidate gate และ fresh Cloudflare Pro/Demo D1/Pages/browser smoke พร้อม branch evidence ที่เขียนกลับสำเร็จแล้ว ดังนั้น **Task 4 = COMPLETE**.

ข้อจำกัดที่ยังคงเดิม:

- ยังไม่ประกาศ V15 ทั้งหมด COMPLETE
- ยังไม่ merge branch `agent/v15-task1-white-label-contract` เข้า `main`
- ยังไม่ประกาศหรือสร้าง CUSTOMER-READY จาก Task 4 โดยลำพัง
- งาน V15 ถัดไปต้องใช้ Task 4 ที่ผ่าน gate นี้เป็นฐานและคง migration ceiling ที่ `0006`
