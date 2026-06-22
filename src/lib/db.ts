import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    // One connection per instance. Vercel can spawn many concurrent instances
    // and the Supabase pgbouncer ceiling is shared; if we let each instance
    // open even 2–3 we hit EMAXCONNS under load.
    max: 1,
    idleTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
