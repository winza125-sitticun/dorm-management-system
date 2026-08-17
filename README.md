# ระบบจัดการหอพักและออกบิล (Full-stack)

Full-stack เวอร์ชันจริงของระบบจัดการหอพัก: **TypeScript + React + Express + PostgreSQL (Drizzle ORM)**
พร้อมล็อกอิน สิทธิ์ผู้ใช้งาน (แอดมิน/ผู้ดูแล) และแจ้งเตือนบิลผ่าน LINE

> ⚠️ **สิ่งที่ต่างจากสเปกเดิม:** ต้นแบบเดิมอ้างอิง **LINE Notify** ซึ่ง LINE
> ได้ปิดให้บริการถาวรไปแล้วตั้งแต่ 31 มีนาคม 2568 (2025) โปรเจกต์นี้จึงใช้
> **LINE Messaging API** (push message) แทน ดูรายละเอียดในหัวข้อ
> "การตั้งค่า LINE" ด้านล่าง

---

## สิ่งที่ต้องมีก่อนเริ่ม

- Node.js 18 ขึ้นไป
- PostgreSQL 14 ขึ้นไป (รันในเครื่องหรือใช้บริการ เช่น Supabase / Neon / Railway)

## เริ่มต้นใช้งาน

```bash
# 1) ติดตั้ง dependencies
npm install

# 2) สร้างไฟล์ .env จากตัวอย่าง แล้วกรอกค่าให้ครบ
cp .env.example .env
# แก้ DATABASE_URL ให้ตรงกับฐานข้อมูลของคุณ
# สร้าง JWT_SECRET แบบสุ่มด้วย: openssl rand -hex 32

# 3) สร้างตารางในฐานข้อมูล
npm run db:push

# 4) ใส่ข้อมูลตั้งต้น (บัญชีแอดมิน/ผู้ดูแล + ห้องตัวอย่าง)
npm run db:seed

# 5) รันเซิร์ฟเวอร์ (โหมดพัฒนา มี hot reload ทั้ง frontend/backend)
npm run dev
```

เปิดเบราว์เซอร์ไปที่ `http://localhost:3000` แล้วล็อกอินด้วย:

- แอดมิน — `admin / admin123`
- ผู้ดูแล — `staff / staff123`

**เปลี่ยนรหัสผ่านเริ่มต้นทันทีก่อนใช้งานจริง** (หน้า "ผู้ใช้งาน" ในแอป)

## Deploy ขึ้นใช้งานจริง

```bash
npm run build   # build frontend เป็นไฟล์ static
npm start       # รันเซิร์ฟเวอร์โหมด production (NODE_ENV=production)
```

รองรับ deploy บนแพลตฟอร์มทั่วไปที่รัน Node.js ได้ (Railway, Render, Fly.io, VPS ของคุณเอง ฯลฯ)
ตั้งค่า environment variables (`DATABASE_URL`, `JWT_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`) บนแพลตฟอร์มนั้นด้วย

---

## โครงสร้างโปรเจกต์

```
server/               Express API (auth, rooms, bills, settings, users)
  index.ts             จุดเริ่มเซิร์ฟเวอร์ + เชื่อม Vite middleware ตอน dev
  db.ts                Drizzle + PostgreSQL client
  auth.ts              bcrypt hash + JWT session
  line.ts              ส่งข้อความผ่าน LINE Messaging API
  middleware.ts         requireAuth / requireAdmin
  routes/*.ts           REST endpoints แยกตามทรัพยากร
  seed.ts               สคริปต์ใส่ข้อมูลตั้งต้น

src/
  db/schema.ts          นิยามตาราง (users, rooms, bills, settings) — Drizzle ORM
  App.tsx               nav, สลับหน้าจอ, session
  types.ts              TypeScript types ฝั่ง frontend
  lib/api.ts             frontend API client (fetch wrapper)
  components/            แต่ละหน้าจอ (Dashboard, Rooms, CreateBill, History,
                         MeterHistory, BillInvoice, Settings, Users, Login)
```

## สิทธิ์การใช้งาน

- **แอดมิน** — ใช้ได้ทุกฟีเจอร์ รวมถึงตั้งค่าหอพักและจัดการบัญชีผู้ใช้ ลบห้อง/บิลได้
- **ผู้ดูแล** — จัดการห้องพัก ออกบิล ดูประวัติ ทำเครื่องหมายชำระเงินได้ แต่ลบห้อง/บิลไม่ได้
  และไม่เห็นเมนูตั้งค่า/ผู้ใช้งาน (บังคับทั้งฝั่ง frontend และ backend)

รหัสผ่านถูกเก็บแบบ **bcrypt hash** (ไม่ใช่ข้อความธรรมดา) และ session ยืนยันตัวตนด้วย
JWT ที่เก็บใน httpOnly cookie ปลอดภัยกว่าการเก็บรหัสผ่านแบบ plain text ในเวอร์ชัน prototype ก่อนหน้านี้

## การตั้งค่า LINE

LINE Notify ปิดให้บริการแล้ว ระบบนี้ใช้ **LINE Messaging API** แทน:

1. สร้าง LINE Official Account + Messaging API channel ที่
   [developers.line.biz/console](https://developers.line.biz/console/)
2. ออก **Channel Access Token** (แบบ long-lived) แล้วใส่ในไฟล์ `.env`:
   ```
   LINE_CHANNEL_ACCESS_TOKEN=your-token-here
   ```
3. ผู้เช่าต้องเพิ่มบัญชี LINE OA ของคุณเป็นเพื่อนก่อน ระบบจึงจะส่งข้อความหาได้
4. หาค่า **LINE userId** ของผู้เช่าแต่ละคน (ขึ้นต้นด้วย `U...`) แล้วกรอกในช่อง
   "LINE User ID" ตอนแก้ไขข้อมูลห้องพัก — MVP นี้ให้กรอกเอง เพื่อความง่าย
   ในการเริ่มต้น หากต้องการให้ผู้เช่ากรอกเองผ่านหน้าเว็บ ควรทำระบบ **LIFF
   Login** เพิ่มเติม (LINE's Login-in-app framework) ซึ่งเป็นขั้นถัดไปที่แนะนำ
5. ถ้าไม่ตั้งค่า `LINE_CHANNEL_ACCESS_TOKEN` ระบบยังใช้งานได้ปกติ แค่จะไม่ส่ง
   แจ้งเตือนอัตโนมัติ (ปุ่ม "ส่ง LINE แจ้งเตือน" จะแจ้ง error ให้ทราบ)

## QR พร้อมเพย์

หน้าใบแจ้งหนี้แสดงเลขบัญชีพร้อมเพย์ให้ผู้เช่าโอนเข้าโดยตรง (ยังไม่ใช่ QR ที่สแกนจ่ายได้จริง)
หากต้องการ QR พร้อมเพย์แบบสแกนจ่ายได้จริง แนะนำใช้ไลบรารี `promptpay-qr` +
`qrcode` สร้างรูป QR จาก payload ตามมาตรฐาน EMVCo แล้วฝังเป็น `<img>` ใน
`BillInvoice.tsx` — ยังไม่ได้ใส่ไว้ในเวอร์ชันนี้เพื่อให้ setup ง่ายที่สุดก่อน

## คำสั่งที่มีให้ใช้

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รันเซิร์ฟเวอร์โหมดพัฒนา (hot reload) |
| `npm run build` | build frontend สำหรับ production |
| `npm start` | รันเซิร์ฟเวอร์โหมด production |
| `npm run db:push` | สร้าง/อัปเดตตารางในฐานข้อมูลตาม schema.ts |
| `npm run db:generate` | สร้างไฟล์ migration (ถ้าอยากเก็บ migration history) |
| `npm run db:studio` | เปิด Drizzle Studio ดู/แก้ข้อมูลผ่าน UI |
| `npm run db:seed` | ใส่ผู้ใช้ตั้งต้น + ค่าตั้งค่าเริ่มต้น + ห้องตัวอย่าง |

## สิ่งที่ยังไม่ได้ทำ (ขั้นต่อไปที่แนะนำ)

- LIFF Login ให้ผู้เช่าลงทะเบียน LINE userId เองแทนการกรอกด้วยมือ
- QR พร้อมเพย์แบบสแกนจ่ายได้จริง
- Rate limiting / CSRF protection สำหรับ production ที่เปิดสู่สาธารณะ
- Export ข้อมูลเป็น Excel/CSV, ระบบสำรองข้อมูลอัตโนมัติ
- Automated tests
