import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { verifyPassword, signSession, SESSION_COOKIE } from "../auth";
import { requireAuth } from "../middleware";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ" });

  const { username, password } = parsed.data;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
  if (!user) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

  const token = signSession({ userId: user.id, role: user.role });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
});

router.post("/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.userId)).limit(1);
  if (!user) return res.status(401).json({ error: "ไม่พบผู้ใช้" });
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
});

export default router;
