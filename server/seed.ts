import "dotenv/config";
import { db, schema } from "./db";
import { hashPassword } from "./auth";

async function seed() {
  console.log("Seeding database...");

  const existingUsers = await db.select().from(schema.users);
  if (existingUsers.length === 0) {
    await db.insert(schema.users).values([
      { username: "admin", passwordHash: await hashPassword("admin123"), name: "ผู้ดูแลระบบ", role: "admin" },
      { username: "staff", passwordHash: await hashPassword("staff123"), name: "พนักงานหอพัก", role: "staff" },
    ]);
    console.log("  ✓ Created default users: admin/admin123 (admin), staff/staff123 (staff)");
  } else {
    console.log("  – Users already exist, skipping");
  }

  const existingSettings = await db.select().from(schema.settings);
  if (existingSettings.length === 0) {
    await db.insert(schema.settings).values({
      dormName: "บ้านสุขสันต์ อพาร์ตเมนท์",
      waterRate: "18",
      electricRate: "8",
      dueDay: 5,
      lateFeePerDay: "20",
      promptpayId: "081-234-5678",
      accountName: "เจ้าของหอพัก",
    });
    console.log("  ✓ Created default settings");
  } else {
    console.log("  – Settings already exist, skipping");
  }

  const existingRooms = await db.select().from(schema.rooms);
  if (existingRooms.length === 0) {
    await db.insert(schema.rooms).values([
      { number: "101", tenantName: "สมชาย ใจดี", tenantPhone: "081-234-5678", rent: "3200", status: "occupied", lastWater: 120, lastElectric: 340 },
      { number: "102", rent: "3200", status: "vacant" },
      { number: "201", tenantName: "พิมพ์ชนก สายใย", tenantPhone: "089-876-5432", rent: "3800", status: "occupied", lastWater: 88, lastElectric: 210 },
    ]);
    console.log("  ✓ Created sample rooms");
  } else {
    console.log("  – Rooms already exist, skipping");
  }

  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
