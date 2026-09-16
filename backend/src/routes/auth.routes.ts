import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", async (req, res) => {
  const { name, email, password, role, salonName, salonAddress } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, and role are required" });
  }

  if (role !== "CLIENT" && role !== "OWNER") {
    return res.status(400).json({ error: "role must be CLIENT or OWNER" });
  }

  if (role === "OWNER" && (!salonName || !salonAddress)) {
    return res.status(400).json({ error: "salonName and salonAddress are required for owner registration" });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  let salonId;
  
  if (role === "OWNER") {
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, passwordHash, role: "OWNER" },
      });

      const newSalon = await tx.salon.create({
        data: { name: salonName, address: salonAddress, ownerId: newUser.id },
      });

      return { newUser, newSalon };
    });

    user = result.newUser;
    salonId = result.newSalon.id;

  } else {
    user = await prisma.user.create({
      data: { name, email, passwordHash, role: "CLIENT" },
    });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role, salonId: salonId || null },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });

});

router.post("/login", async (req, res) => {
  const { email, password} = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email, password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: "Invalid email or password" });
  }  

  let salonId;
  if (user.role === "OWNER"){
    salonId = (await prisma.salon.findUnique({ where: { ownerId: user.id }, select: {id: true} }))?.id;
  } else if (user.role === "STAFF"){
    salonId = user.salonId;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role, salonId: salonId || null },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    message: "logged successfully",
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });

});

router.get("/me", requireAuth, async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, role: true },
  });

  res.status(200).json({ user });
});


export default router;
