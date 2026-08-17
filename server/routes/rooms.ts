import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireAdmin } from "../middleware";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(schema.rooms).orderBy(schema.rooms.number);
  res.json(rows);
});

const roomSchema = z.object({
  number: z.string().min(1),
  tenantName: z.string().optional().default(""),
  tenantPhone: z.string().optional().default(""),
  rent: z.number().nonnegative(),
  status: z.enum(["vacant", "occupied"]),
  lastWater: z.number().int().nonnegative(),
  lastElectric: z.number().int().nonnegative(),
  lineUserId: z.string().optional().default(""),
});

router.post("/", async (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [row] = await db
    .insert(schema.rooms)
    .values({ ...parsed.data, rent: String(parsed.data.rent) })
    .returning();
  res.status(201).json(row);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = roomSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data: Record<string, unknown> = { ...parsed.data };
  if (typeof parsed.data.rent === "number") data.rent = String(parsed.data.rent);
  const [row] = await db.update(schema.rooms).set(data).where(eq(schema.rooms.id, id)).returning();
  if (!row) return res.status(404).json({ error: "ไม่พบห้องพัก" });
  res.json(row);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(schema.rooms).where(eq(schema.rooms.id, id));
  res.json({ ok: true });
});

export default router;
