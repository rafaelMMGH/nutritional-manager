import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Reuse one client across Next.js dev hot reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The pg adapter sends timestamps without an offset, so pin the session to UTC
// (the server default here is America/Mexico_City, which would shift every value).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC" });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
