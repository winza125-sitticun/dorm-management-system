import type { Request, Response, NextFunction } from "express";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./auth";

declare global {
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? verifySession(token) : null;
  if (!session) {
    return res.status(401).json({ error: "ยังไม่ได้เข้าสู่ระบบ" });
  }
  req.user = session;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "เฉพาะแอดมินเท่านั้น" });
  }
  next();
}
