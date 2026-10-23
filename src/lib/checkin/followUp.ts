// Seguimiento del check-in del viernes, sin exponer a nadie en público:
//
//   viernes 10:00 CR → DM a cada manager con quién de su área no respondió
//   viernes 11:00 CR → aviso en #weekly-check-ins con cuántos faltan (sin nombres)
//
// El resumen se arma a las 13:00 con lo que haya.

import { prisma } from "@/lib/db";
import { postSlackMessage } from "@/lib/integrations/checkin";
import { lookupSlackUserByEmail, openDm } from "@/lib/integrations/kpiCheckin";
import { neutralizeSlack } from "@/lib/report/privacy";
import { checkinWeek, weekParticipation, type CheckinMember } from "./teamCheckin";
import { weekLabel } from "./teamForm";

export const SUMMARY_HOUR_LABEL = "13:00";

export type FollowUpResult = { step: "managers" | "channel"; sent: string[]; skipped: Array<{ name: string; reason: string }>; dryRun: boolean };

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function managerFollowUpText(managerName: string, pending: CheckinMember[], week: string): string {
  const list = pending.map((m) => `• ${neutralizeSlack(m.displayName)} (${neutralizeSlack(m.team.name)})`).join("\n");
  const who = pending.length === 1 ? "1 persona de tu área no ha respondido" : `${pending.length} personas de tu área no han respondido`;
  return (
    `👀 ${neutralizeSlack(firstName(managerName))}, ${who} el check-in de la semana del ${week}:\n${list}\n` +
    `¿Les escribís? El resumen de la empresa se arma hoy a las ${SUMMARY_HOUR_LABEL}. ` +
    `Si alguien está con mucha carga, también sirve saberlo.`
  );
}

export function channelReminderText(pending: number, total: number): string {
  const faltan = pending === 1 ? "Falta 1 check-in" : `Faltan ${pending} check-ins`;
  return (
    `⏰ ${faltan} de ${total} esta semana. El resumen de la empresa se arma hoy a las ${SUMMARY_HOUR_LABEL}.\n` +
    `Si te falta el tuyo, está en tu DM de *Mawi Check-ins*: son unos 5 minutos.`
  );
}

// DM a cada manager (líder del área; si no hay, su alterno) con su gente
// pendiente. El manager no aparece en su propia lista.
export async function runManagerFollowUp(options: { dryRun?: boolean; now?: Date } = {}): Promise<FollowUpResult> {
  const now = options.now ?? new Date();
  const period = checkinWeek(now);
  const result: FollowUpResult = { step: "managers", sent: [], skipped: [], dryRun: !!options.dryRun };
  const [{ pending }, areas] = await Promise.all([
    weekParticipation(period, now),
    prisma.reportArea.findMany({
      where: { active: true },
      include: { leader: { select: { id: true, name: true, email: true } }, alternate: { select: { id: true, name: true, email: true } } },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  for (const area of areas) {
    const manager = area.leader ?? area.alternate;
    const missing = pending.filter((m) => m.areaKey === area.key && (!manager || m.userId !== manager.id));
    if (!missing.length) continue;
    if (!manager) {
      result.skipped.push({ name: area.name, reason: "el área no tiene líder" });
      continue;
    }
    const text = managerFollowUpText(manager.name, missing, weekLabel(period));
    if (options.dryRun) {
      result.sent.push(`${manager.name} (${area.name}): ${missing.map((m) => m.displayName).join(", ")} (dry-run)`);
      continue;
    }
    try {
      const slackId = await lookupSlackUserByEmail(manager.email);
      const dm = slackId ? await openDm(slackId) : null;
      if (!dm) throw new Error("sin DM");
      await postSlackMessage(dm, text);
      result.sent.push(`${manager.name} (${area.name})`);
    } catch {
      result.skipped.push({ name: manager.name, reason: "no se pudo enviar el DM" });
    }
  }
  console.log(`[checkin-follow-up] managers: enviados ${result.sent.length}, saltados ${result.skipped.length}${result.dryRun ? " (dry-run)" : ""}`);
  return result;
}

// Aviso en el canal con el conteo; nunca nombres. No sale si ya respondieron
// todos o si el resumen ya se publicó.
export async function runChannelReminder(options: { channel: string | null; dryRun?: boolean; now?: Date }): Promise<FollowUpResult> {
  const now = options.now ?? new Date();
  const period = checkinWeek(now);
  const result: FollowUpResult = { step: "channel", sent: [], skipped: [], dryRun: !!options.dryRun };
  const [{ pending, members, answers }, summary] = await Promise.all([
    weekParticipation(period, now),
    prisma.weeklySummary.findUnique({ where: { periodStart: period }, select: { status: true } }),
  ]);
  const total = Math.max(members.length, answers.length);
  if (!options.channel) result.skipped.push({ name: "canal", reason: "falta WEEKLY_CHANNEL_ID" });
  else if (!pending.length) result.skipped.push({ name: "canal", reason: "respondieron todos" });
  else if (summary?.status === "sent") result.skipped.push({ name: "canal", reason: "el resumen ya se publicó" });
  else if (options.dryRun) result.sent.push(`canal: faltan ${pending.length} de ${total} (dry-run)`);
  else {
    await postSlackMessage(options.channel, channelReminderText(pending.length, total));
    result.sent.push(`canal: faltan ${pending.length} de ${total}`);
  }
  return result;
}
