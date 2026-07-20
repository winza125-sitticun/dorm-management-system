import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireAdmin } from "../middleware";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const [row] = await db.select().from(schema.settings).limit(1);
  if (!row) return res.status(404).json({ error: "ยังไม่มีการตั้งค่า รันคำสั่ง npm run db:seed" });
  res.json(row);
});

const settingsSchema = z.object({
  dormName: z.string().min(1),
  waterRate: z.number().nonnegative(),
  electricRate: z.number().nonnegative(),
  dueDay: z.number().int().min(1).max(31),
  lateFeePerDay: z.number().nonnegative(),
  promptpayId: z.string().optional().default(""),
  accountName: z.string().optional().default(""),
});

router.put("/", requireAdmin, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [existing] = await db.select().from(schema.settings).limit(1);
  const data = {
    ...parsed.data,
    waterRate: String(parsed.data.waterRate),
    electricRate: String(parsed.data.electricRate),
    lateFeePerDay: String(parsed.data.lateFeePerDay),
  };
  if (!existing) {
    const [row] = await db.insert(schema.settings).values(data).returning();
    return res.json(row);
  }
  const [row] = await db.update(schema.settings).set(data).where(eq(schema.settings.id, existing.id)).returning();
  res.json(row);
});

export default router;
