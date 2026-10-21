// Integración del check-in semanal y el resumen contra un Postgres LOCAL
// (src/test/db.ts se niega a correr contra otro host). Slack y Claude son
// falsos: ningún mensaje real sale.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { dbAvailable } from "@/test/db";

const skip = !dbAvailable;
const v = (value: string) => ({ v: { value } });

async function setup() {
  const { prisma } = await import("@/lib/db");
  const { crWeekStart } = await import("@/lib/time/costaRica");
  const tag = Math.random().toString(36).slice(2, 8);
  const leader = await prisma.user.create({ data: { email: `l-${tag}@test.local`, name: "Lore Test", role: "sales", passwordHash: "x" } });
  const area = await prisma.reportArea.create({ data: { key: `ventas-${tag}`, name: "Ventas Test", leaderId: leader.id, sortOrder: 1 } });
  const slackA = `UA${tag.toUpperCase()}`;
  const slackB = `UB${tag.toUpperCase()}`;
  const a = await prisma.reportMember.create({ data: { areaId: area.id, displayName: "María Test", slackUserId: slackA, identityVerified: true, teamKey: "ventas", validFrom: new Date("2026-01-01") } });
  const b = await prisma.reportMember.create({ data: { areaId: area.id, displayName: "Daniel Test", slackUserId: slackB, identityVerified: true, teamKey: "ventas", validFrom: new Date("2026-01-01") } });
  const period = crWeekStart(new Date("2026-10-15T21:00:00Z")); // jueves 15 oct
  const prevPeriod = new Date(period.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cleanup = async () => {
    await prisma.teamCheckin.deleteMany({ where: { slackUserId: { in: [slackA, slackB] } } });
    await prisma.checkinEvidence.deleteMany({ where: { slackUserId: { in: [slackA, slackB] } } });
    await prisma.weeklySummary.deleteMany({ where: { periodStart: period } });
    await prisma.reportMember.deleteMany({ where: { areaId: area.id } });
    await prisma.reportArea.deleteMany({ where: { id: area.id } });
    await prisma.user.deleteMany({ where: { id: leader.id } });
  };
  return { prisma, tag, area, a, b, slackA, slackB, period, prevPeriod, cleanup };
}

let ctx: Awaited<ReturnType<typeof setup>>;

before(async () => {
  if (skip) return;
  ctx = await setup();
  // Si quedó un resumen de esta semana de otra corrida, se descarta.
  await ctx.prisma.weeklySummary.deleteMany({ where: { periodStart: ctx.period } });
});
after(async () => {
  if (skip) return;
  await ctx.cleanup();
  await ctx.prisma.$disconnect();
});

test("el envío guarda en EOS y refleja la evidencia; el compromiso anterior se exige", { skip }, async () => {
  const { submitTeamCheckin } = await import("@/lib/checkin/teamCheckin");
  const { crIsoDate } = await import("@/lib/time/costaRica");
  const p = (d: Date) => JSON.stringify({ p: crIsoDate(d), m: ctx.a.id });

  // Semana anterior: deja un compromiso.
  const first = await submitTeamCheckin({
    slackUserId: ctx.slackA,
    privateMetadata: p(ctx.prevPeriod),
    values: { energy: { v: { selected_option: { value: "4" } } }, result: v("Dos demos con perfil que retiene"), learning: v("Discovery corto"), commitment: v("3 cierres") },
    now: new Date("2026-10-08T22:00:00Z"),
  });
  assert.equal(first.kind, "saved");

  // Esta semana: sin marcar el anterior → error en el bloque prev.
  const missing = await submitTeamCheckin({
    slackUserId: ctx.slackA,
    privateMetadata: p(ctx.period),
    values: { energy: { v: { selected_option: { value: "4" } } }, result: v("FG Asesores cerró en 5 días"), learning: v("Discovery riguroso"), commitment: v("4 cierres") },
    now: new Date("2026-10-15T22:00:00Z"),
  });
  assert.equal(missing.kind, "errors");
  if (missing.kind === "errors") assert.ok(missing.errors.prev);

  const ok = await submitTeamCheckin({
    slackUserId: ctx.slackA,
    privateMetadata: p(ctx.period),
    values: {
      energy: { v: { selected_option: { value: "2" } } },
      energy_reason: v("Semana pesada en casa"),
      prev: { v: { selected_option: { value: "partial" } } },
      result: v("FG Asesores cerró en 5 días"),
      learning: v("Discovery riguroso"),
      num_cierres: v("2"),
      blocker: v("Necesito el módulo de avance de obra"),
      commitment: v("4 cierres"),
    },
    now: new Date("2026-10-15T22:00:00Z"),
  });
  assert.equal(ok.kind, "saved");
  const row = await ctx.prisma.teamCheckin.findUniqueOrThrow({ where: { periodStart_slackUserId: { periodStart: ctx.period, slackUserId: ctx.slackA } } });
  assert.equal(row.previousCommitment, "3 cierres");
  assert.equal(row.previousCommitmentStatus, "partial");
  assert.equal(row.areaKey, ctx.area.key);
  assert.equal(row.energy, 2);
  assert.ok(!JSON.stringify(row).includes("Semana pesada"), "el motivo personal no se guarda en EOS");
  const ev = await ctx.prisma.checkinEvidence.findUniqueOrThrow({ where: { id: row.evidenceId! } });
  assert.ok(!ev.originalText.includes("Semana pesada"), "ni en la evidencia");
  assert.equal(ev.win, "FG Asesores cerró en 5 días");
  assert.equal(ev.challenge, "Necesito el módulo de avance de obra");
  assert.equal(ev.periodStart.getTime(), ctx.period.getTime());
});

test("nadie puede enviar el formulario de otra persona", { skip }, async () => {
  const { submitTeamCheckin } = await import("@/lib/checkin/teamCheckin");
  const { crIsoDate } = await import("@/lib/time/costaRica");
  const r = await submitTeamCheckin({
    slackUserId: ctx.slackB,
    privateMetadata: JSON.stringify({ p: crIsoDate(ctx.period), m: ctx.a.id }),
    values: { energy: { v: { selected_option: { value: "4" } } }, result: v("suplantación"), learning: v("x x x"), commitment: v("x x x") },
  });
  assert.equal(r.kind, "rejected");
});

test("editar agrega una revisión y no duplica", { skip }, async () => {
  const { submitTeamCheckin } = await import("@/lib/checkin/teamCheckin");
  const { crIsoDate } = await import("@/lib/time/costaRica");
  const r = await submitTeamCheckin({
    slackUserId: ctx.slackA,
    privateMetadata: JSON.stringify({ p: crIsoDate(ctx.period), m: ctx.a.id }),
    values: {
      energy: { v: { selected_option: { value: "2" } } },
      energy_reason: v("Semana pesada en casa"),
      prev: { v: { selected_option: { value: "done" } } },
      result: v("FG Asesores y Sampson cerraron en ≤8 días"),
      learning: v("Discovery riguroso"),
      commitment: v("4 cierres"),
    },
    now: new Date("2026-10-16T13:00:00Z"),
  });
  assert.equal(r.kind, "saved");
  const rows = await ctx.prisma.teamCheckin.findMany({ where: { slackUserId: ctx.slackA, periodStart: ctx.period } });
  assert.equal(rows.length, 1);
  assert.equal((rows[0].revisions as unknown[]).length, 1);
  const evidence = await ctx.prisma.checkinEvidence.count({ where: { slackUserId: ctx.slackA, periodStart: ctx.period } });
  assert.equal(evidence, 1);
});

test("el borrador usa solo lo visible y el envío es único", { skip }, async () => {
  const { saveCheckin } = await import("@/lib/checkin/teamCheckin");
  const { TEAMS } = await import("@/lib/checkin/teams");
  // Daniel responde algo que se va a ocultar.
  const hiddenRow = await saveCheckin({
    period: ctx.period, now: new Date("2026-10-16T14:00:00Z"), team: TEAMS.ventas, previousCommitment: null,
    member: { id: ctx.b.id, displayName: "Daniel Test", slackUserId: ctx.slackB, userId: null, areaKey: ctx.area.key },
    submission: { energy: 5, energyReason: null, result: "TEXTO-OCULTO", learning: "aprendizaje oculto", extra: null, blocker: null, commitment: "algo", previousCommitmentStatus: null, numbers: [] },
  });
  await ctx.prisma.teamCheckin.update({ where: { id: hiddenRow.id }, data: { hidden: true } });

  const { generateDraft, sendSummary } = await import("./summary");
  let prompt = "";
  const g = await generateDraft(ctx.period, {
    now: new Date("2026-10-16T18:00:00Z"),
    deps: {
      claude: async (p) => {
        prompt = p;
        return { areas: [{ areaKey: ctx.area.key, texto: "Dos cierres en ciclos cortos (María Test)." }], aprendizajes: ["El discovery acorta el ciclo (María Test)"] };
      },
    },
  });
  assert.equal(g.status, "generated");
  assert.ok(!prompt.includes("TEXTO-OCULTO"), "lo oculto no le llega a Claude");
  assert.ok(g.draftText!.includes("Dos cierres en ciclos cortos"));
  assert.ok(!g.draftText!.includes("TEXTO-OCULTO"));

  const calls: Array<{ text: string; threadTs?: string | null }> = [];
  const slack = {
    async post(a: { channel: string; text: string; threadTs?: string | null; idempotencyKey: string }) {
      calls.push({ text: a.text, threadTs: a.threadTs });
      return { status: "sent" as const, ts: `ts-${calls.length}`, channel: a.channel };
    },
    async find() {
      return { found: false as const };
    },
  };
  const sent = await sendSummary(ctx.period, "actor", { slack, channel: "C-TEST" });
  assert.equal(sent.ts, "ts-1");
  assert.ok(calls.length >= 2, "principal + hilo de compromisos");
  assert.equal(calls[1].threadTs, "ts-1");
  await assert.rejects(sendSummary(ctx.period, "actor", { slack, channel: "C-TEST" }), /ya se envió/);

  const again = await generateDraft(ctx.period, { deps: { claude: async () => null } });
  assert.equal(again.status, "already_sent", "un resumen enviado no se regenera");
});
