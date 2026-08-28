// Pre-read del L10 en Slack, 15 minutos antes de la reunión.
//
// Manda el mismo material que el dashboard, en el orden en que se discute:
// wins → métricas en rojo/riesgo → challenges (los IDS de la reunión). La
// idea es que nadie llegue en frío aunque no haya abierto el tablero.
//
// Destino: L10_CHANNEL_ID si está seteado (acepta el ID `C...` o `#nombre`);
// si no, DM a cada líder. El default es DM a propósito — el resumen trae MRR y
// churn, y el canal de check-ins es de toda la empresa. Para postear en un
// canal, el bot tiene que estar invitado ahí (`/invite @mawi_checkins`).

import { prisma } from "@/lib/db";
import { getCurrentWeekStartCR } from "@/lib/utils";
import { postSlackMessage } from "./checkin";
import { lookupSlackUserByEmail, openDm } from "./kpiCheckin";

const LEADERSHIP_ROLES = ["ceo", "sales", "cs", "product", "engineering"];

function fmt(value: number | null | undefined, unit: string | null): string {
  if (value === null || value === undefined) return "sin dato";
  const n = Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (unit === "%") return `${n}%`;
  if (unit === "$") return `$${n}`;
  return n;
}

// Cuántas semanas seguidas lleva la métrica en rojo/riesgo.
function redStreak(entries: Array<{ status: string }>): number {
  let streak = 0;
  for (const e of entries) {
    if (e.status === "off_track" || e.status === "riesgo") streak++;
    else break;
  }
  return streak;
}

export async function buildL10Digest(): Promise<string | null> {
  const quarter = await prisma.quarter.findFirst({ where: { isActive: true } });
  if (!quarter) return null;

  const weekStart = getCurrentWeekStartCR();

  const [meeting, wins, metrics] = await Promise.all([
    prisma.l10Meeting.findFirst({
      where: { quarterId: quarter.id, status: { not: "completed" } },
      orderBy: { date: "desc" },
      include: {
        issues: {
          include: { raisedBy: true, linkedRock: true, linkedMetric: true, votes: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.winChallenge.findMany({
      where: { quarterId: quarter.id, entryType: "win", reportDate: { gte: weekStart } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.scorecardMetric.findMany({
      where: { isActive: true },
      include: { owner: true, entries: { orderBy: { periodStart: "desc" }, take: 5 } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const rocks = await prisma.rock.findMany({
    where: { quarterId: quarter.id, finalStatus: null, status: { in: ["off_track", "riesgo"] } },
    include: { owner: true },
  });

  const issues = meeting?.issues ?? [];
  const issuesByMetric = new Set(issues.map((i) => i.linkedMetricId).filter(Boolean));
  const issuesByRock = new Set(issues.map((i) => i.linkedRockId).filter(Boolean));
  const red = metrics.filter((m) => ["off_track", "riesgo"].includes(m.entries[0]?.status ?? ""));
  const uncovered =
    red.filter((m) => !issuesByMetric.has(m.id)).length + rocks.filter((r) => !issuesByRock.has(r.id)).length;

  const fecha = new Date().toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" });

  const lines: string[] = [
    `🗓️ *L10 de hoy — ${fecha}, arranca en 15 minutos*`,
    `Esto es lo que está sobre la mesa. Si algo de acá les toca, lleguen con la respuesta lista.\n`,
  ];

  // 1. WINS
  lines.push(`🏆 *Wins de la semana* — ${wins.length} cargado${wins.length === 1 ? "" : "s"}`);
  if (wins.length === 0) {
    lines.push("• Nadie cargó wins esta semana.");
  } else {
    for (const w of wins) {
      lines.push(`• *${w.user.name.split(" ")[0]}:* ${w.wins}${w.result ? `\n     _Resultado: ${w.result}_` : ""}`);
    }
  }

  // 2. ROJOS Y RIESGO
  lines.push(
    `\n🔴 *En rojo o riesgo* — ${red.length + rocks.length} en total` +
      (uncovered > 0 ? `, ${uncovered} sin IDS que lo cubra` : ", todos cubiertos"),
  );
  if (red.length + rocks.length === 0) {
    lines.push("• Todo el tablero en verde.");
  } else {
    for (const m of red) {
      const e = m.entries[0];
      const dot = e?.status === "off_track" ? "🔴" : "🟡";
      const streak = redStreak(m.entries);
      const cronico = streak >= 4 ? ` · ⚠️ ${streak} períodos seguidos en rojo` : "";
      const cover = issuesByMetric.has(m.id) ? "" : " · *sin IDS*";
      lines.push(
        `${dot} *${m.name}* — va en ${fmt(e?.actualValue, m.unit)}, se esperaba ${fmt(e?.expectedValue ?? m.targetNumeric, m.unit)}\n` +
          `     _Responsable: ${m.owner.name.split(" ")[0]}${cronico}${cover}_`,
      );
    }
    for (const r of rocks) {
      const dot = r.status === "off_track" ? "🔴" : "🟡";
      const cover = issuesByRock.has(r.id) ? "" : " · *sin IDS*";
      lines.push(
        `${dot} *Rock: ${r.title}* — ${r.progress}% de avance\n` +
          `     _Responsable: ${r.owner.name.split(" ")[0]}${r.risk ? ` · Riesgo: ${r.risk}` : ""}${cover}_`,
      );
    }
  }

  // 3. CHALLENGES / IDS
  lines.push(`\n🧱 *Challenges para discutir* — ${issues.length}`);
  if (issues.length === 0) {
    lines.push("• Nadie levantó challenges esta semana.");
  } else {
    for (const i of issues) {
      const link = i.linkedRock?.title ?? i.linkedMetric?.name ?? "sin vínculo";
      const votes = i.votes.length ? ` · ${i.votes.length} voto${i.votes.length > 1 ? "s" : ""}` : "";
      const detalle = i.description ? `\n     ${i.description}` : "";
      lines.push(
        `• *${i.raisedBy.name.split(" ")[0]}* — ${i.title}${detalle}\n` +
          `     _Prioridad ${i.priority} · Ligado a: ${link}${votes}_`,
      );
    }
  }

  // 4. QUIÉN NO CARGÓ NADA
  const leaders = await prisma.user.findMany({ where: { role: { in: LEADERSHIP_ROLES } } });
  const participaron = new Set([...wins.map((w) => w.userId), ...issues.map((i) => i.raisedById)]);
  const faltantes = leaders.filter((u) => !participaron.has(u.id));
  if (faltantes.length > 0) {
    lines.push(`\n⏳ *Sin cargar nada esta semana:* ${faltantes.map((u) => u.name.split(" ")[0]).join(", ")}`);
  }

  const appUrl = process.env.NEXTAUTH_URL;
  if (appUrl) lines.push(`\n📊 Tablero completo y votación: ${appUrl}/l10`);

  return lines.join("\n");
}

export async function sendL10Digest(options?: { dryRun?: boolean }): Promise<{
  text: string | null;
  recipients: string[];
  dryRun: boolean;
}> {
  const dryRun = options?.dryRun ?? false;
  const text = await buildL10Digest();
  if (!text) return { text: null, recipients: [], dryRun };

  const channel = process.env.L10_CHANNEL_ID?.trim();
  if (channel) {
    if (!dryRun) await postSlackMessage(channel, text);
    return { text, recipients: [channel], dryRun };
  }

  // Sin canal configurado: DM a cada líder.
  const users = await prisma.user.findMany({
    where: { role: { in: LEADERSHIP_ROLES } },
    orderBy: { name: "asc" },
  });

  const recipients: string[] = [];
  for (const u of users) {
    const slackUserId = await lookupSlackUserByEmail(u.email);
    if (!slackUserId) continue;
    if (dryRun) {
      recipients.push(`${u.name} (dry-run)`);
      continue;
    }
    const dm = await openDm(slackUserId);
    if (!dm) continue;
    await postSlackMessage(dm, text);
    recipients.push(u.name);
  }

  console.log(`[l10-digest] Enviado a ${recipients.length} destinatarios${dryRun ? " (dry-run)" : ""}`);
  return { text, recipients, dryRun };
}
