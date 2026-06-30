// Revert the DB to the snapshot captured by snapshot-l10.ts.
//
// Behavior:
//   - Insert-only tables (wins, meetings, issues, votes, commitments, reads,
//     annotations, coverages): delete any row created since the snapshot
//   - Mutable tables (rocks, scorecardEntries): restore the snapshotted
//     fields (progress/status/risk/finalStatus on rocks, actualValue/status/
//     notes on entries); rows created after snapshot are deleted

import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

interface Snapshot {
  capturedAt: string;
  winsChallenges: Array<{ id: string }>;
  meetings: Array<{ id: string; status: string; phase: string; notes: string | null; date: string | Date }>;
  issues: Array<{ id: string }>;
  votes: Array<{ id: string }>;
  commitments: Array<{ id: string }>;
  reads: Array<{ id: string }>;
  annotations: Array<{ id: string }>;
  coverages: Array<{ id: string }>;
  rocks: Array<{ id: string; progress: number; status: string; risk: string | null; finalStatus: string | null }>;
  scorecardEntries: Array<{
    id: string;
    actualValue: number | null;
    actualDisplay: string | null;
    status: string;
    notes: string | null;
  }>;
}

function idSet<T extends { id: string }>(rows: T[]): Set<string> {
  return new Set(rows.map((r) => r.id));
}

async function main() {
  const raw = readFileSync("scripts/.l10-snapshot.json", "utf-8");
  const snap = JSON.parse(raw) as Snapshot;
  console.log(`Reverting to snapshot from ${snap.capturedAt}`);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  await prisma.$transaction(async (tx) => {
    // INSERT-ONLY tables — delete rows not present in snapshot
    const delWins = await tx.winChallenge.deleteMany({ where: { NOT: { id: { in: snap.winsChallenges.map((r) => r.id) } } } });
    const delIssues = await tx.l10Issue.deleteMany({ where: { NOT: { id: { in: snap.issues.map((r) => r.id) } } } });
    const delVotes = await tx.l10IssueVote.deleteMany({ where: { NOT: { id: { in: snap.votes.map((r) => r.id) } } } });
    const delCommits = await tx.l10Commitment.deleteMany({ where: { NOT: { id: { in: snap.commitments.map((r) => r.id) } } } });
    const delReads = await tx.l10PreReadRead.deleteMany({ where: { NOT: { id: { in: snap.reads.map((r) => r.id) } } } });
    const delAnnos = await tx.l10Annotation.deleteMany({ where: { NOT: { id: { in: snap.annotations.map((r) => r.id) } } } });
    const delCovs = await tx.l10Coverage.deleteMany({ where: { NOT: { id: { in: snap.coverages.map((r) => r.id) } } } });
    const delMeetings = await tx.l10Meeting.deleteMany({ where: { NOT: { id: { in: snap.meetings.map((r) => r.id) } } } });

    console.log(`Deleted new rows — wins:${delWins.count} issues:${delIssues.count} votes:${delVotes.count} commits:${delCommits.count} reads:${delReads.count} annos:${delAnnos.count} covs:${delCovs.count} meetings:${delMeetings.count}`);

    // MEETINGS — restore mutable fields on snapshotted ones
    for (const m of snap.meetings) {
      await tx.l10Meeting.update({
        where: { id: m.id },
        data: { status: m.status, phase: m.phase, notes: m.notes ?? null },
      });
    }

    // ROCKS — delete any new ones, restore mutable fields on snapshotted ones
    const snapRockIds = idSet(snap.rocks);
    const currentRocks = await tx.rock.findMany({ select: { id: true } });
    const newRockIds = currentRocks.filter((r) => !snapRockIds.has(r.id)).map((r) => r.id);
    if (newRockIds.length > 0) {
      await tx.rock.deleteMany({ where: { id: { in: newRockIds } } });
      console.log(`Deleted ${newRockIds.length} new rocks`);
    }
    for (const r of snap.rocks) {
      await tx.rock.update({
        where: { id: r.id },
        data: { progress: r.progress, status: r.status, risk: r.risk, finalStatus: r.finalStatus },
      });
    }

    // SCORECARD ENTRIES — delete any new ones, restore mutable fields on snapshotted ones
    const snapEntryIds = idSet(snap.scorecardEntries);
    const currentEntries = await tx.scorecardEntry.findMany({ select: { id: true } });
    const newEntryIds = currentEntries.filter((e) => !snapEntryIds.has(e.id)).map((e) => e.id);
    if (newEntryIds.length > 0) {
      await tx.scorecardEntry.deleteMany({ where: { id: { in: newEntryIds } } });
      console.log(`Deleted ${newEntryIds.length} new scorecard entries`);
    }
    for (const e of snap.scorecardEntries) {
      await tx.scorecardEntry.update({
        where: { id: e.id },
        data: { actualValue: e.actualValue, actualDisplay: e.actualDisplay, status: e.status, notes: e.notes ?? null },
      });
    }
  }, { timeout: 60_000 });

  console.log("Revert complete.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
