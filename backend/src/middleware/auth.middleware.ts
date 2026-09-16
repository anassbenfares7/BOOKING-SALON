import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      role: string;
      salonId: string | null;
    };
    req.userId = payload.userId;
    req.userRole = payload.role;
    req.salonId = payload.salonId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
