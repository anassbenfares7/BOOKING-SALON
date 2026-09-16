import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.post("/", requireAuth, requireRole("OWNER"), async (req, res) => {
    const {name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "name, email, password, and role are required" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    if (!req.salonId) {
        return res.status(400).json({ error: "No salon found for this account" });
    }

    const user = await prisma.user.create({
        data: {name, email, passwordHash, role: "STAFF", salonId: req.salonId},
    });

    
    res.status(201).json({
    message: "STAFF is created successfully",
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

})

export default router;