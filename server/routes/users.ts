import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { requireAuth, requireAdmin } from "../middleware";
import { hashPassword } from "../auth";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(schema.users).orderBy(schema.users.createdAt);
  res.json(rows.map(({ passwordHash, ...rest }) => rest));
});

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["admin", "staff"]),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await db.select().from(schema.users).where(eq(schema.users.username, parsed.data.username)).limit(1);
  if (existing.length) return res.status(409).json({ error: "ชื่อผู้ใช้นี้มีอยู่แล้ว" });

  const passwordHash = await hashPassword(parsed.data.password);
  const [row] = await db
    .insert(schema.users)
    .values({ username: parsed.data.username, name: parsed.data.name, role: parsed.data.role, passwordHash })
    .returning();
  const { passwordHash: _omit, ...safe } = row;
  res.status(201).json(safe);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "staff"]).optional(),
  password: z.string().min(6).optional(),
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.role) data.role = parsed.data.role;
  if (parsed.data.password) data.passwordHash = await hashPassword(parsed.data.password);

  const [row] = await db.update(schema.users).set(data).where(eq(schema.users.id, id)).returning();
  if (!row) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
  const { passwordHash: _omit, ...safe } = row;
  res.json(safe);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.userId) return res.status(400).json({ error: "ไม่สามารถลบบัญชีที่ใช้งานอยู่ได้" });
  await db.delete(schema.users).where(eq(schema.users.id, id));
  res.json({ ok: true });
});

export default router;
