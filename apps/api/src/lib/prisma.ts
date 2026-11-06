import { PrismaClient } from "@prisma/client";

// Um único client por processo (pool de conexões compartilhado).
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
