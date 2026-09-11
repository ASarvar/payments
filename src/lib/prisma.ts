import { PrismaClient } from "@prisma/client";

// O'z bazamiz (foydalanuvchilar, audit). Dev'da hot-reload ko'p ulanish ochmasligi
// uchun global singleton.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
