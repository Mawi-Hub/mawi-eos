// Capture a point-in-time snapshot of mutable L10-related state so you can
// run an end-to-end demo and revert afterward without touching unrelated data.
//
//   npx tsx scripts/snapshot-l10.ts
//   (do your test)
//   npx tsx scripts/revert-l10.ts

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Serialize — prod app shares the same Supabase pooler ceiling
  const winsChallenges = await prisma.winChallenge.findMany();
  const meetings = await prisma.l10Meeting.findMany();
  const issues = await prisma.l10Issue.findMany();
  const votes = await prisma.l10IssueVote.findMany();
  const commitments = await prisma.l10Commitment.findMany();
  const reads = await prisma.l10PreReadRead.findMany();
  const annotations = await prisma.l10Annotation.findMany();
  const coverages = await prisma.l10Coverage.findMany();
  const rocks = await prisma.rock.findMany();
  const scorecardEntries = await prisma.scorecardEntry.findMany();

  const snapshot = {
    capturedAt: new Date().toISOString(),
    winsChallenges,
    meetings,
    issues,
    votes,
    commitments,
    reads,
    annotations,
    coverages,
    rocks,
    scorecardEntries,
  };

  const path = "scripts/.l10-snapshot.json";
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot saved to ${path}`);
  console.log(`  winsChallenges: ${winsChallenges.length}`);
  console.log(`  meetings:       ${meetings.length}`);
  console.log(`  issues:         ${issues.length}`);
  console.log(`  votes:          ${votes.length}`);
  console.log(`  commitments:    ${commitments.length}`);
  console.log(`  reads:          ${reads.length}`);
  console.log(`  annotations:    ${annotations.length}`);
  console.log(`  coverages:      ${coverages.length}`);
  console.log(`  rocks:          ${rocks.length}  (will restore progress/status/risk/finalStatus)`);
  console.log(`  scorecardEntries: ${scorecardEntries.length}  (will restore actualValue/status/notes)`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
