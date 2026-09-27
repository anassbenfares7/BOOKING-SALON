import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

class BookingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseTime(time: unknown): number | null {
  if (typeof time !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDate(date: unknown): Date | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return parsed;
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

  const bookingDate = parseDate(date);
  if (!bookingDate) {
    return res.status(400).json({ error: "Invalid date, expected YYYY-MM-DD" });
  }

  const newStart = parseTime(startTime);
  if (newStart === null) {
    return res.status(400).json({ error: "Invalid time format, expected HH:MM" });
  }

  if (new Date(`${date}T${startTime}:00`) < new Date()) {
    return res.status(400).json({ error: "Cannot book a time in the past" });
  }

  try {
    const [staff, service, hours] = await Promise.all([
      prisma.user.findUnique({ where: { id: staffId }, select: { role: true, salonId: true } }),
      prisma.service.findUnique({ where: { id: serviceId } }),
      prisma.workingHours.findUnique({
        where: { staffId_dayOfWeek: { staffId, dayOfWeek: bookingDate.getUTCDay() } },
      }),
    ]);

    if (!staff || staff.role !== "STAFF") {
      return res.status(404).json({ error: "Staff member not found" });
    }
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }
    if (service.salonId !== staff.salonId) {
      return res.status(400).json({ error: "This service is not offered by this staff member's salon" });
    }

    const newEnd = newStart + service.duration;

    if (!hours) {
      return res.status(400).json({ error: "This staff member does not work on this day" });
    }
    const workStart = parseTime(hours.startTime);
    const workEnd = parseTime(hours.endTime);
    if (workStart === null || workEnd === null) {
      throw new Error("Invalid working hours stored for staff");
    }
    if (newStart < workStart || newEnd > workEnd) {
      return res.status(400).json({ error: `Outside working hours (${hours.startTime}-${hours.endTime})` });
    }

    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${staffId}))`;

      const newEnd = newStart + service.duration;

      const existing = await tx.reservation.findMany({
        where: { staffId, date: bookingDate, status: { not: "CANCELLED" } },
        include: { service: true },
      });

      const overlaps = existing.some((r) => {
        const existingStart = parseTime(r.startTime)!;
        const existingEnd = existingStart + r.service.duration;
        return existingStart < newEnd && existingEnd > newStart;
      });

      if (overlaps) throw new BookingError(409, "This time slot is no longer available");

      return tx.reservation.create({
        data: {
          clientId,
          staffId,
          serviceId,
          date: bookingDate,
          startTime,
          priceAtBooking: service.price,
          status: "PENDING",
        },
      });
    });

    res.status(201).json({ message: "Reservation created", reservation });
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create reservation" });
  }
});

export default router;