import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireAdmin } from "../middleware";
import { sendLineMessage } from "../line";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(schema.bills).orderBy(schema.bills.createdAt);
  res.json(rows.reverse());
});

const createBillSchema = z.object({
  roomId: z.number().int(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  waterNew: z.number().int().nonnegative(),
  electricNew: z.number().int().nonnegative(),
  rent: z.number().nonnegative().optional(),
  extraFee: z.number().nonnegative().optional().default(0),
  extraLabel: z.string().optional().default(""),
});

router.post("/", async (req, res) => {
  const parsed = createBillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { roomId, month, waterNew, electricNew, extraFee, extraLabel } = parsed.data;

  const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.id, roomId)).limit(1);
  if (!room) return res.status(404).json({ error: "ไม่พบห้องพัก" });

  const [settingsRow] = await db.select().from(schema.settings).limit(1);
  if (!settingsRow) return res.status(500).json({ error: "ยังไม่ได้ตั้งค่าหอพัก" });

  const waterOld = room.lastWater;
  const electricOld = room.lastElectric;
  const waterUnits = Math.max(0, waterNew - waterOld);
  const electricUnits = Math.max(0, electricNew - electricOld);
  const waterCost = waterUnits * Number(settingsRow.waterRate);
  const electricCost = electricUnits * Number(settingsRow.electricRate);
  const rent = parsed.data.rent ?? Number(room.rent);
  const total = rent + waterCost + electricCost + (extraFee || 0);

  const [y, m] = month.split("-").map(Number);
  const dueDate = new Date(y, m - 1, settingsRow.dueDay);

  const [bill] = await db
    .insert(schema.bills)
    .values({
      roomId: room.id,
      roomNumber: room.number,
      tenantName: room.tenantName || "",
      month,
      waterOld,
      waterNew,
      waterUnits,
      waterCost: String(waterCost),
      electricOld,
      electricNew,
      electricUnits,
      electricCost: String(electricCost),
      rent: String(rent),
      extraFee: String(extraFee || 0),
      extraLabel: extraLabel || "",
      total: String(total),
      status: "unpaid",
      dueDate,
    })
    .returning();

  await db
    .update(schema.rooms)
    .set({ lastWater: waterNew, lastElectric: electricNew })
    .where(eq(schema.rooms.id, room.id));

  // Best-effort LINE notification — never blocks bill creation if it fails.
  let lineResult: { ok: boolean; error?: string } | null = null;
  if (room.lineUserId) {
    const text = [
      `📋 ใบแจ้งหนี้ ${settingsRow.dormName}`,
      `ห้อง ${room.number} — ${month}`,
      `ค่าเช่า: ${rent.toLocaleString()} บาท`,
      `ค่าน้ำ (${waterUnits} หน่วย): ${waterCost.toLocaleString()} บาท`,
      `ค่าไฟ (${electricUnits} หน่วย): ${electricCost.toLocaleString()} บาท`,
      `รวมทั้งสิ้น: ${total.toLocaleString()} บาท`,
      `กำหนดชำระ: ${dueDate.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`,
    ].join("\n");
    lineResult = await sendLineMessage(room.lineUserId, text);
    if (lineResult.ok) {
      await db.update(schema.bills).set({ lineNotified: true }).where(eq(schema.bills.id, bill.id));
    }
  }

  res.status(201).json({ bill: { ...bill, lineNotified: !!lineResult?.ok }, lineResult });
});

router.patch("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status === "paid" ? "paid" : "unpaid";
  const [row] = await db.update(schema.bills).set({ status }).where(eq(schema.bills.id, id)).returning();
  if (!row) return res.status(404).json({ error: "ไม่พบบิล" });
  res.json(row);
});

router.post("/:id/notify", async (req, res) => {
  const id = Number(req.params.id);
  const [bill] = await db.select().from(schema.bills).where(eq(schema.bills.id, id)).limit(1);
  if (!bill) return res.status(404).json({ error: "ไม่พบบิล" });
  const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.id, bill.roomId)).limit(1);
  if (!room?.lineUserId) return res.status(400).json({ error: "ห้องนี้ยังไม่ได้ผูก LINE" });

  const text = `📋 แจ้งเตือนบิลค้างชำระ ห้อง ${bill.roomNumber} เดือน ${bill.month} ยอด ${Number(bill.total).toLocaleString()} บาท`;
  const result = await sendLineMessage(room.lineUserId, text);
  if (result.ok) await db.update(schema.bills).set({ lineNotified: true }).where(eq(schema.bills.id, id));
  res.json(result);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(schema.bills).where(eq(schema.bills.id, id));
  res.json({ ok: true });
});

export default router;
