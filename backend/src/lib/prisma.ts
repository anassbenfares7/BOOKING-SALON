import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

try {
  await prisma.$connect();
  console.log("✅ Database connected successfully");
} catch (error) {
  console.error("❌ Database connection failed:", error);
  process.exit(1);
}
