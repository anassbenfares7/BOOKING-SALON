import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

function toMinutes(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);

  if (Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error("INVALID_TIME_FORMAT");
  }

  return h * 60 + m;
}


router.post("/reservations", requireAuth, requireRole("CLIENT"), async (req, res) => {
  const { staffId, serviceId, date, startTime } = req.body;

  if (!staffId || !serviceId || !date || !startTime) {
    return res.status(400).json({ error: "staffId, serviceId, date, and startTime are required" });
  }

  if (!req.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const clientId = req.userId;

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${staffId}))`;

      const service = await tx.service.findUnique({ where: { id: serviceId } });
      if (!service) throw new Error("SERVICE_NOT_FOUND");

      const newStart = toMinutes(startTime);
      const newEnd = newStart + service.duration;

      const existing = await tx.reservation.findMany({
        where: { staffId, date: new Date(date), status: { not: "CANCELLED" } },
        include: { service: true },
      });

      const overlaps = existing.some((r) => {
        const existingStart = toMinutes(r.startTime);
        const existingEnd = existingStart + r.service.duration;
        return existingStart < newEnd && existingEnd > newStart;
      });

      if (overlaps) throw new Error("SLOT_TAKEN");

      return tx.reservation.create({
        data: {
          clientId,
          staffId,
          serviceId,
          date: new Date(date),
          startTime,
          priceAtBooking: service.price,
          status: "PENDING",
        },
      });
    });

    res.status(201).json({ message: "Reservation created", reservation });
  } catch (error) {
    if (error instanceof Error && error.message === "SLOT_TAKEN") {
      return res.status(409).json({ error: "This time slot is no longer available" });
    }
    if (error instanceof Error && error.message === "SERVICE_NOT_FOUND") {
      return res.status(404).json({ error: "Service not found" });
    }
    if (error instanceof Error && error.message === "INVALID_TIME_FORMAT") {
      return res.status(400).json({ error: "Invalid time format, expected HH:MM" });
    }

    res.status(500).json({ error: "Failed to create reservation" });
  }
});

export default router;
