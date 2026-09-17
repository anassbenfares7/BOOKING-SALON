import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get("/working-hours/:staffId", async (req, res) => {
  const { staffId } = req.params;
  try {
    const hours = await prisma.workingHours.findMany({ where: { staffId } });
    res.json(hours);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch working hours" });
  }
});

router.put("/staff/working-hours", requireAuth, requireRole("STAFF"), async (req, res) => {
  const { dayOfWeek, startTime, endTime } = req.body;

  if (dayOfWeek === undefined || !startTime || !endTime) {
    return res.status(400).json({ error: "dayOfWeek, startTime, and endTime are required" });
  }

  if (!req.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const hours = await prisma.workingHours.upsert({
      where: { staffId_dayOfWeek: { staffId: req.userId, dayOfWeek } },
      update: { startTime, endTime },
      create: { staffId: req.userId, dayOfWeek, startTime, endTime },
    });
    res.status(200).json({ message: "Working hours saved", hours });
  } catch (error) {
    res.status(500).json({ error: "Failed to save working hours" });
  }
});

export default router;
