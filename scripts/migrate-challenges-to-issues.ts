// Convierte los challenges que el check-in de Slack escribió en WinChallenge
// hacia L10Issue, que es lo que la reunión realmente muestra y vota.
// Corre una sola vez: npx tsx --env-file=.env.local scripts/migrate-challenges-to-issues.ts
import "dotenv/config";
import { prisma } from "@/lib/db";

async function main() {
  const quarter = await prisma.quarter.findFirst({ where: { isActive: true } });
  if (!quarter) throw new Error("No hay trimestre activo");

  // Solo los que entraron por Slack en este trimestre y traen vínculo: los
  // challenges históricos anteriores se quedan como están.
  const rows = await prisma.$queryRaw<
    { id: string; user_id: string; key_challenge: string; priority: string; linked_rock_id: string | null; linked_metric_id: string | null }[]
  >`SELECT id, user_id, key_challenge, priority, linked_rock_id, linked_metric_id
    FROM wins_challenges
    WHERE entry_type = 'challenge'
      AND quarter_id = ${quarter.id}
      AND (linked_rock_id IS NOT NULL OR linked_metric_id IS NOT NULL)`;

  console.log(`Challenges con vínculo por migrar: ${rows.length}`);
  if (rows.length === 0) return;

  let meeting = await prisma.l10Meeting.findFirst({
    where: { quarterId: quarter.id, status: { not: "completed" } },
    orderBy: { date: "desc" },
  });
  if (!meeting) {
    meeting = await prisma.l10Meeting.create({
      data: { quarterId: quarter.id, date: new Date(), status: "upcoming", phase: "preread" },
    });
    console.log(`Reunión creada para colgarlos: ${meeting.id}`);
  }

  for (const r of rows) {
    // El título del check-in venía como "titulo — detalle".
    const [title, ...rest] = r.key_challenge.split(" — ");
    const issue = await prisma.l10Issue.create({
      data: {
        meetingId: meeting.id,
        raisedById: r.user_id,
        title: title.slice(0, 200),
        description: rest.length ? rest.join(" — ") : null,
        priority: r.priority,
        linkedRockId: r.linked_rock_id,
        linkedMetricId: r.linked_metric_id,
        submittedAt: new Date(),
      },
      include: { raisedBy: true, linkedMetric: true, linkedRock: true },
    });
    await prisma.winChallenge.delete({ where: { id: r.id } });
    console.log(
      `  ✅ ${issue.raisedBy.name}: ${issue.title} → ${issue.linkedRock?.title ?? issue.linkedMetric?.name}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
