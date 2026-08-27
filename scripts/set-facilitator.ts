// Marca (o desmarca) al facilitador del L10.
//   npx tsx --env-file=.env.local scripts/set-facilitator.ts gabriela@mawi.io
//   npx tsx --env-file=.env.local scripts/set-facilitator.ts gabriela@mawi.io --off
import "dotenv/config";
import { prisma } from "@/lib/db";

async function main() {
  const [email, ...flags] = process.argv.slice(2);
  if (!email) throw new Error("Uso: set-facilitator.ts <email> [--off]");
  const isFacilitator = !flags.includes("--off");

  const user = await prisma.user.update({
    where: { email },
    data: { isFacilitator },
    select: { name: true, email: true, isFacilitator: true },
  });
  console.log(`${user.name} <${user.email}> → facilitador: ${user.isFacilitator}`);

  const all = await prisma.user.findMany({
    where: { OR: [{ isFacilitator: true }, { role: "ceo" }] },
    select: { name: true, role: true, isFacilitator: true },
    orderBy: { name: "asc" },
  });
  console.log("\nPueden operar el L10:");
  for (const u of all) {
    console.log(`  ${u.name}${u.role === "ceo" ? " (CEO)" : ""}${u.isFacilitator ? " (facilitador)" : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
