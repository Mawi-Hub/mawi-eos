// Aviso de las 08:45 (viernes) a los managers que no terminaron la preparación
// de la reunión. Dice qué falta en concreto; quien ya terminó no recibe nada.

import { prisma } from "@/lib/db";
import { postSlackMessage } from "@/lib/integrations/checkin";
import { mondayOfWeek } from "@/lib/integrations/manualEntry";
import type { BlockStatus, PrepBlocks } from "@/lib/integrations/leaderPrep";

const BLOCK_LABEL: Record<keyof PrepBlocks, string> = {
  rock: "estado del Rock",
  scorecard: "métricas",
  wins: "wins del área",
  agreements: "acuerdos anteriores",
  ids: "IDS",
};

const LEGACY_STEP_LABEL: Record<string, string> = {
  wins: "tu win",
  metrics: "tus métricas",
  challenges: "tus challenges",
  challenges_relink: "vincular tus challenges",
};

// Qué le falta a una preparación v2, en el orden de los bloques.
export function missingFromBlocks(blocks: PrepBlocks): string[] {
  const out: string[] = [];
  for (const key of ["rock", "scorecard", "wins", "agreements", "ids"] as const) {
    const b = blocks[key] as { status?: BlockStatus; items?: Array<{ outcome?: string }> } | undefined;
    if (!b || b.status === "pending" || b.status === "collecting") {
      if (key === "scorecard" && b?.items) {
        const asked = b.items.filter((i) => i.outcome === "asked").length;
        out.push(asked ? `${asked} métrica${asked === 1 ? "" : "s"}` : BLOCK_LABEL[key]);
      } else out.push(BLOCK_LABEL[key]);
    }
  }
  return out;
}

export function nudgeText(firstName: string, missing: string[]): string {
  const list = missing.length ? missing.join(", ") : "confirmar la preparación";
  return (
    `⏰ ${firstName}, te falta: *${list}*.\n` +
    `Tenés hasta las *9:00* para cerrar la preparación; a las 9:15 sale el pre-read y marca lo que no se cargó. ` +
    `Respondé acá mismo para seguir donde quedaste.`
  );
}

export async function runLeaderNudge(options: { dryRun?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const weekStart = mondayOfWeek(now);
  const sessions = await prisma.kpiCheckinSession.findMany({
    where: { weekStart, preview: false, step: { not: "done" } },
    include: { user: { select: { id: true, name: true } } },
  });

  const result = { sent: [] as string[], skipped: [] as Array<{ name: string; reason: string }>, dryRun: !!options.dryRun };
  for (const s of sessions) {
    let missing: string[];
    if (s.step.startsWith("prep_")) {
      const prep = await prisma.leaderPrep.findFirst({
        where: { leaderId: s.userId, createdAt: { gte: weekStart } },
        orderBy: { createdAt: "desc" },
      });
      if (prep?.status === "confirmed") {
        result.skipped.push({ name: s.user.name, reason: "ya confirmó" });
        continue;
      }
      missing = missingFromBlocks((prep?.blocks ?? {}) as PrepBlocks);
    } else {
      missing = [LEGACY_STEP_LABEL[s.step] ?? "terminar el check-in"];
    }
    const text = nudgeText(s.user.name.split(" ")[0], missing);
    if (options.dryRun) {
      result.sent.push(`${s.user.name}: ${missing.join(", ") || "confirmar"} (dry-run)`);
      continue;
    }
    try {
      await postSlackMessage(s.slackChannelId, text);
      result.sent.push(s.user.name);
    } catch {
      result.skipped.push({ name: s.user.name, reason: "no se pudo enviar el DM" });
    }
  }
  return result;
}
