// Pre-read del L10 en Slack, 15 minutos antes de la reunión.
//
// Manda el mismo material que el dashboard, en el orden en que se discute:
// wins → métricas en rojo/riesgo → challenges (los IDS de la reunión). La
// idea es que nadie llegue en frío aunque no haya abierto el tablero.
//
// Destino: L10_CHANNEL_ID si está seteado; si no, DM a cada líder. El default
// es DM a propósito — el resumen trae MRR y churn, y el canal de check-ins es
// de todo el equipo.

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
      include: { owner: true, entries: { orderBy: { periodStart: "desc" }, take: 1 } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const rocks = await prisma.rock.findMany({
    where: { quarterId: quarter.id, finalStatus: null, status: { in: ["off_track", "riesgo"] } },
    include: { owner: true },
  });

  const lines: string[] = ["🗓️ *L10 en 15 minutos* — esto es lo que hay sobre la mesa\n"];

  // 1. WINS
  lines.push(`🏆 *Wins de la semana* (${wins.length})`);
  if (wins.length === 0) {
    lines.push("• Nadie cargó wins esta semana.");
  } else {
    for (const w of wins) {
      lines.push(`• *${w.user.name.split(" ")[0]}:* ${w.wins}${w.result ? ` — ${w.result}` : ""}`);
    }
  }

  // 2. ROJOS Y RIESGO
  const issuesByMetric = new Set((meeting?.issues ?? []).map((i) => i.linkedMetricId).filter(Boolean));
  const issuesByRock = new Set((meeting?.issues ?? []).map((i) => i.linkedRockId).filter(Boolean));

  const red = metrics.filter((m) => ["off_track", "riesgo"].includes(m.entries[0]?.status ?? ""));
  lines.push(`\n🔴 *En rojo o riesgo* (${red.length + rocks.length})`);
  if (red.length + rocks.length === 0) {
    lines.push("• Todo el tablero en verde.");
  } else {
    for (const m of red) {
      const e = m.entries[0];
      const dot = e?.status === "off_track" ? "🔴" : "🟡";
      const cover = issuesByMetric.has(m.id) ? "" : "  _· sin IDS_";
      lines.push(
        `${dot} *${m.name}* — ${fmt(e?.actualValue, m.unit)} vs ${fmt(e?.expectedValue ?? m.targetNumeric, m.unit)} esperado · ${m.owner.name.split(" ")[0]}${cover}`,
      );
    }
    for (const r of rocks) {
      const dot = r.status === "off_track" ? "🔴" : "🟡";
      const cover = issuesByRock.has(r.id) ? "" : "  _· sin IDS_";
      lines.push(`${dot} *Rock: ${r.title}* — ${r.progress}% de 100% · ${r.owner.name.split(" ")[0]}${cover}`);
    }
  }

  // 3. CHALLENGES / IDS
  const issues = meeting?.issues ?? [];
  lines.push(`\n🧱 *Challenges para hoy* (${issues.length})`);
  if (issues.length === 0) {
    lines.push("• Nadie levantó challenges. Si llegamos así, la reu es de 10 minutos.");
  } else {
    for (const i of issues) {
      const link = i.linkedRock?.title ?? i.linkedMetric?.name ?? "sin vínculo";
      const votes = i.votes.length ? ` · ${i.votes.length} voto${i.votes.length > 1 ? "s" : ""}` : "";
      lines.push(`• [${i.priority}] *${i.raisedBy.name.split(" ")[0]}:* ${i.title}\n     _→ ${link}${votes}_`);
    }
  }

  const appUrl = process.env.NEXTAUTH_URL;
  if (appUrl) lines.push(`\n📊 Tablero completo: ${appUrl}/l10`);

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

  const channel = process.env.L10_CHANNEL_ID;
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
