import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/role.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();


router.get("/services/:salonId", async (req, res) => {
    const { salonId } = req.params;
    try {
        const services = await prisma.service.findMany({ where : { salonId }});
        res.json(services);
    } catch (error){
        res.status(500).json({ error: "Failed to fetch services" })
    } 
});

router.post("/owner/services/", requireAuth, requireRole("OWNER"), async (req, res) => {
    const { name, description, duration, price } = req.body;

    if (!name || !description || duration === undefined || price === undefined) {
        return res.status(400).json({ error: "name, description, duration, and price are required" });
    }

    if (!req.salonId) {
        return res.status(400).json({ error: "No salon found for this account" });
    }

    try {
        const service = await prisma.service.create({ data: { name, description, duration, price, salonId: req.salonId } });
        res.status(201).json({
            message: "Service created successfully",
            service
        });
    } catch (error){
        res.status(500).json({ error: "Failed to create service" })
    } 
});

router.put("/owner/services/:id", requireAuth, requireRole("OWNER"), async (req, res) => {
  const { id } = req.params;
  const { name, description, duration, price } = req.body;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Service ID is required" });
  }


  const service = await prisma.service.findUnique({ where: { id } });

  if (!service || service.salonId !== req.salonId) {
    return res.status(404).json({ error: "Service not found" });
  }

  try {
    const updated = await prisma.service.update({
      where: { id },
      data: { name, description, duration, price },
    });
    res.status(200).json({ message: "Service updated successfully", service: updated });
  } catch (error) {
    res.status(500).json({ error: "Failed to update service" });
  }
});

router.delete("/owner/services/:id", requireAuth, requireRole("OWNER"), async (req, res) => {
  const { id } = req.params;

  if (typeof id !== "string") {
    return res.status(400).json({ error: "Service ID is required" });
  }

  const service = await prisma.service.findUnique({ where: { id } });

  if (!service || service.salonId !== req.salonId) {
    return res.status(404).json({ error: "Service not found" });
  }

  try {
    await prisma.service.delete({ where: { id } });
    res.status(200).json({ message: "Service deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete service" });
  }
});


export default router;