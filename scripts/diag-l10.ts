import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, email: true } });
  console.log("USERS:", JSON.stringify(users, null, 2));

  const quarter = await prisma.quarter.findFirst({ where: { isActive: true } });
  console.log("QUARTER:", JSON.stringify(quarter, null, 2));

  const meetings = await prisma.l10Meeting.findMany({
    orderBy: { date: "desc" },
    take: 5,
    include: { commitments: true, issues: true },
  });
  console.log("MEETINGS:", JSON.stringify(meetings, null, 2));

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
