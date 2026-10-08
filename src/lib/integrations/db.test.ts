// Pruebas con la base de datos LOCAL (src/test/db.ts se niega a correr contra
// otro host). Cubren las implementaciones reales de los almacenes: evidencia,
// eventos de Slack, datos del check-in v2 y la puerta LEADER_CHECKIN_V2.
// Slack/Claude/Notion siempre simulados.
import { dbAvailable } from "../../test/db";
import assert from "node:assert/strict";
import { after, afterEach, before, test, type TestContext } from "node:test";

const skip = !dbAvailable;
const uid = Math.random().toString(36).slice(2, 8);
const channelId = `Ctest-${uid}`;

type P = typeof import("@/lib/db").prisma;
let prisma: P;
const created = { users: [] as string[], quarters: [] as string[], areas: [] as string[], meetings: [] as string[] };

before(async () => {
  if (skip) return;
  prisma = (await import("@/lib/db")).prisma;
});

async function mkUser(role = "cs") {
  const user = await prisma.user.create({
    data: { email: `t-${uid}-${created.users.length}@example.test`, name: `Test ${uid} ${created.users.length}`, role, passwordHash: "x" },
  });
  created.users.push(user.id);
  return user;
}

let yearSeq = 2300 + Math.floor(Math.random() * 500);
async function mkQuarter(isActive: boolean) {
  const q = await prisma.quarter.create({
    data: { year: yearSeq++, quarter: 1, startDate: new Date("2020-01-01"), endDate: new Date("2099-12-31"), isActive },
  });
  created.quarters.push(q.id);
  return q;
}

async function mkArea(leaderId: string | null, key = `area-${uid}-${created.areas.length}`) {
  const area = await prisma.reportArea.create({ data: { key, name: `Área ${key}`, leaderId } });
  created.areas.push(area.id);
  return area;
}

afterEach(() => {
  delete process.env.LEADER_CHECKIN_V2;
});

after(async () => {
  if (skip) return;
  await prisma.slackEvent.deleteMany({ where: { eventId: { startsWith: `Ev-${uid}` } } });
  await prisma.checkinEvidence.deleteMany({ where: { channelId } });
  await prisma.l10Commitment.deleteMany({ where: { meetingId: { in: created.meetings } } });
  await prisma.l10Issue.deleteMany({ where: { meetingId: { in: created.meetings } } });
  await prisma.leaderPrep.deleteMany({ where: { areaId: { in: created.areas } } });
  await prisma.winChallenge.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.kpiCheckinSession.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.reportMember.deleteMany({ where: { areaId: { in: created.areas } } });
  await prisma.areaQuarterConfig.deleteMany({ where: { areaId: { in: created.areas } } });
  const meetings = await prisma.l10Meeting.findMany({ where: { quarterId: { in: created.quarters } }, select: { id: true } });
  const meetingIds = [...created.meetings, ...meetings.map((m) => m.id)];
  await prisma.l10Commitment.deleteMany({ where: { meetingId: { in: meetingIds } } });
  await prisma.l10Issue.deleteMany({ where: { meetingId: { in: meetingIds } } });
  await prisma.leaderPrep.deleteMany({ where: { meetingId: { in: meetingIds } } });
  await prisma.l10Meeting.deleteMany({ where: { id: { in: meetingIds } } });
  await prisma.rock.deleteMany({ where: { quarterId: { in: created.quarters } } });
  await prisma.winChallenge.deleteMany({ where: { quarterId: { in: created.quarters } } });
  await prisma.reportArea.deleteMany({ where: { id: { in: created.areas } } });
  await prisma.quarter.deleteMany({ where: { id: { in: created.quarters } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

test("SlackEvent store: unique by event id, attempts, processed and a safe error", { skip }, async () => {
  const { prismaSlackEventStore: store } = await import("./slackEvents");
  const eventId = `Ev-${uid}-1`;
  const first = await store.create({ eventId, eventType: "checkin_message", channelId, messageTs: "1.1" });
  assert.equal(first.created, true);
  const dup = await store.create({ eventId, eventType: "checkin_message", channelId, messageTs: "1.1" });
  assert.equal(dup.created, false);
  assert.equal(dup.row.processedAt, null);
  await store.markAttempt(eventId);
  await store.markFailed(eventId, "notion:Error");
  let row = await prisma.slackEvent.findUniqueOrThrow({ where: { eventId } });
  assert.equal(row.attempts, 1);
  assert.equal(row.lastError, "notion:Error");
  await store.markProcessed(eventId);
  row = await prisma.slackEvent.findUniqueOrThrow({ where: { eventId } });
  assert.ok(row.processedAt);
  assert.equal(row.lastError, null);
  assert.equal((await store.create({ eventId, eventType: "x", channelId, messageTs: null })).row.processedAt !== null, true);
});

test("checkin evidence: identity only from a verified, valid Slack link; same row on retry; no name matching", { skip }, async () => {
  const { processCheckinEvent, processCheckinEdit, processCheckinDelete } = await import("./checkin");
  const user = await mkUser();
  const area = await mkArea(user.id);
  const slackId = `U${uid}A`;
  await prisma.reportMember.create({ data: { areaId: area.id, userId: user.id, displayName: "Ana Pérez", slackUserId: slackId, identityVerified: true, validFrom: new Date("2020-01-01") } });
  // Mismo nombre visible, Slack ID sin verificar: no cuenta.
  await prisma.reportMember.create({ data: { areaId: area.id, userId: user.id, displayName: "Ana Pérez", slackUserId: `U${uid}B`, identityVerified: false } });
  // Verificado pero vencido antes del mensaje: no cuenta.
  await prisma.reportMember.create({ data: { areaId: area.id, userId: user.id, displayName: "Ana Pérez", slackUserId: `U${uid}C`, identityVerified: true, validFrom: new Date("2019-01-01"), validTo: new Date("2020-06-01") } });

  let pages = 0;
  const deps = {
    getUserName: async () => "Ana Pérez",
    extract: async () => ({ tipo: "Jueves" as const, es_checkin: true, energia: 4, por_que: "x", win: "Cerramos el piloto", reto: null }),
    getPermalink: async () => "https://slack.test/p",
    createNotionPage: async () => `page-${++pages}`,
    updateNotionPage: async () => undefined,
  };
  const ts = String(new Date("2026-09-10T15:30:00Z").getTime() / 1000);
  const ev = (user: string, tsv = ts) => ({ type: "message", user, text: "Energía 4. Cerramos el piloto", channel: channelId, ts: tsv });

  await processCheckinEvent(ev(slackId), deps);
  await processCheckinEvent(ev(slackId), deps); // reintento
  const row = await prisma.checkinEvidence.findUniqueOrThrow({ where: { channelId_messageTs: { channelId, messageTs: ts } } });
  assert.equal(pages, 1);
  assert.equal(row.userId, user.id);
  assert.equal(row.areaKey, area.key);
  assert.equal(row.notionPageId, "page-1");
  assert.equal(row.originalText, "Energía 4. Cerramos el piloto");
  assert.equal(row.periodStart.toISOString(), "2026-09-07T06:00:00.000Z");
  assert.equal(await prisma.checkinEvidence.count({ where: { channelId } }), 1);

  const ts2 = String(new Date("2026-09-10T16:30:00Z").getTime() / 1000);
  for (const [i, slack] of [`U${uid}B`, `U${uid}C`, "UNOBODY"].entries()) {
    await processCheckinEvent(ev(slack, `${ts2}${i}`), deps);
  }
  const pending = await prisma.checkinEvidence.findMany({ where: { channelId, NOT: { messageTs: ts } } });
  assert.equal(pending.length, 3);
  assert.ok(pending.every((r) => r.userId === null && r.areaKey === null));

  await processCheckinEdit({ type: "message", subtype: "message_changed", channel: channelId, user: "", text: "", ts, message: { user: slackId, text: "Energía 4. Cerramos el piloto y escalamos", ts } }, deps);
  const edited = await prisma.checkinEvidence.findUniqueOrThrow({ where: { channelId_messageTs: { channelId, messageTs: ts } } });
  assert.equal(edited.originalText, "Energía 4. Cerramos el piloto");
  assert.equal((edited.revisions as unknown[]).length, 1);

  await processCheckinDelete({ type: "message", subtype: "message_deleted", channel: channelId, user: "", text: "", ts, deleted_ts: ts }, deps);
  const deleted = await prisma.checkinEvidence.findUniqueOrThrow({ where: { channelId_messageTs: { channelId, messageTs: ts } } });
  assert.ok(deleted.deletedAt);
});

test("prismaPrepData: private IDS, non-shareable highlighted wins, date-change history and area-scoped commitments", { skip }, async () => {
  const { prismaPrepData: data } = await import("./leaderPrepData");
  const { buildCommitmentPatch } = await import("./leaderPrep");
  const leader = await mkUser();
  const member = await mkUser("sales");
  const outsider = await mkUser("product");
  const quarter = await mkQuarter(false);
  const area = await mkArea(leader.id);
  await prisma.reportMember.create({ data: { areaId: area.id, userId: member.id, displayName: "M", validFrom: new Date("2020-01-01") } });
  const meeting = await prisma.l10Meeting.create({ data: { quarterId: quarter.id, date: new Date(), status: "upcoming" } });
  const older = await prisma.l10Meeting.create({ data: { quarterId: quarter.id, date: new Date("2026-09-01"), status: "completed" } });
  created.meetings.push(meeting.id, older.id);

  const prep = await data.ensurePrep(meeting.id, area.id, leader.id);
  assert.equal((await data.ensurePrep(meeting.id, area.id, member.id)).id, prep.id); // única por reunión+área
  assert.equal(prep.leaderId, leader.id);
  await data.savePrep(prep.id, { blocks: { rock: { status: "answered", rock: null } }, status: "confirmed", confirmedAt: new Date() });
  const reloaded = await data.loadPrep(meeting.id, area.id);
  assert.equal(reloaded?.status, "confirmed");
  assert.equal(reloaded?.blocks.rock?.status, "answered");

  const rock = await prisma.rock.create({ data: { quarterId: quarter.id, ownerId: leader.id, title: "R", description: "d", deliverable: "d", doneCriteria: "d" } });
  assert.equal((await data.getRock(quarter.id, area.id, leader.id))?.id, rock.id);
  await data.updateRockStatus(rock.id, "riesgo");
  assert.equal((await prisma.rock.findUniqueOrThrow({ where: { id: rock.id } })).status, "riesgo");

  const winId = await data.createWin(leader.id, quarter.id, "Un win");
  const win = await prisma.winChallenge.findUniqueOrThrow({ where: { id: winId! } });
  assert.deepEqual([win.entryType, win.highlighted, win.shareable], ["win", true, false]);

  const issueId = await data.createIssue({
    meetingId: meeting.id, raisedById: leader.id, title: "IDS", description: "Impacto: x", priority: "alto",
    linkedRockId: rock.id, linkedMetricId: null, dueDate: new Date("2026-10-20T00:00:00Z"),
  });
  const issue = await prisma.l10Issue.findUniqueOrThrow({ where: { id: issueId } });
  assert.deepEqual([issue.shareable, issue.sharedSummary, issue.linkedRockId], [false, null, rock.id]);
  assert.equal(await data.countIssues(meeting.id, leader.id), 1);

  const mk = (ownerId: string, action: string, extra: Record<string, unknown> = {}) =>
    prisma.l10Commitment.create({ data: { meetingId: older.id, ownerId, action, dueDate: new Date("2026-10-05T00:00:00Z"), ...extra } });
  const mine = await mk(leader.id, "mío");
  const theirs = await mk(member.id, "de un miembro");
  await mk(outsider.id, "de otra área");
  await mk(leader.id, "ya listo", { done: true, status: "done" });
  await mk(leader.id, "propuesto", { accepted: false });
  const listed = await data.listOpenCommitments(area.id, leader.id, meeting.id, 9);
  assert.deepEqual(listed.map((c) => c.action).sort(), ["de un miembro", "mío"]);

  const current = (await data.getCommitment(mine.id))!;
  await data.updateCommitment(mine.id, buildCommitmentPatch(current, { outcome: "pending", reason: "legal", nextStep: "firmar", newDueDate: "2026-10-30" }, { id: leader.id, at: new Date("2026-10-08T22:00:00Z") }));
  const updated = await prisma.l10Commitment.findUniqueOrThrow({ where: { id: mine.id } });
  assert.equal(updated.status, "pending");
  assert.equal(updated.done, false);
  assert.equal(updated.nextStep, "firmar");
  assert.equal(updated.dueDate.toISOString().slice(0, 10), "2026-10-30");
  assert.equal(updated.originalDueDate?.toISOString().slice(0, 10), "2026-10-05");
  assert.deepEqual(updated.dateChanges, [{ from: "2026-10-05", to: "2026-10-30", reason: "legal", byId: leader.id, at: "2026-10-08T22:00:00.000Z" }]);
  await data.updateCommitment(theirs.id, buildCommitmentPatch((await data.getCommitment(theirs.id))!, { outcome: "done" }, { id: leader.id, at: new Date() }));
  const done = await prisma.l10Commitment.findUniqueOrThrow({ where: { id: theirs.id } });
  assert.deepEqual([done.done, done.status], [true, "done"]);
});

function slackFetch(t: TestContext) {
  const posts: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("users.lookupByEmail")) return Response.json({ ok: true, user: { id: "UTEST" } });
    if (u.includes("conversations.open")) return Response.json({ ok: true, channel: { id: "DTEST" } });
    if (u.includes("chat.postMessage")) { posts.push(JSON.parse(String(init?.body)).text); return Response.json({ ok: true }); }
    throw new Error(`Unexpected request in test: ${u}`);
  });
  return posts;
}

test("LEADER_CHECKIN_V2 off: the Thursday DM is exactly the legacy flow and creates no preparation", { skip }, async (t) => {
  const { startKpiCheckins } = await import("./kpiCheckin");
  const leader = await mkUser();
  const area = await mkArea(leader.id);
  delete process.env.LEADER_CHECKIN_V2;
  const posts = slackFetch(t);
  const result = await startKpiCheckins({ onlyEmail: leader.email });
  assert.deepEqual(result.sent, [leader.name]);
  assert.equal(result.legacyFallback, undefined);
  const session = await prisma.kpiCheckinSession.findFirstOrThrow({ where: { userId: leader.id } });
  assert.equal(session.step, "wins");
  assert.match(posts[0], /¿cuál fue tu WIN de la semana\?/);
  assert.equal(await prisma.leaderPrep.count({ where: { areaId: area.id } }), 0);
});

test("LEADER_CHECKIN_V2 on: someone without an area falls back to the legacy flow and is reported", { skip }, async (t) => {
  const { startKpiCheckins } = await import("./kpiCheckin");
  const person = await mkUser();
  process.env.LEADER_CHECKIN_V2 = "1";
  const posts = slackFetch(t);
  const result = await startKpiCheckins({ onlyEmail: person.email });
  assert.deepEqual(result.sent, [person.name]);
  assert.equal(result.legacyFallback?.length, 1);
  assert.match(result.legacyFallback![0].reason, /área de reporte/);
  assert.equal((await prisma.kpiCheckinSession.findFirstOrThrow({ where: { userId: person.id } })).step, "wins");
  assert.match(posts[0], /WIN de la semana/);
});

test("LEADER_CHECKIN_V2 on: an area leader gets the five-block preparation stored in LeaderPrep", { skip }, async (t) => {
  if ((await prisma.quarter.count({ where: { isActive: true } })) > 0) return t.skip("hay un trimestre activo ajeno en la base local");
  const { startKpiCheckins } = await import("./kpiCheckin");
  const leader = await mkUser();
  const quarter = await mkQuarter(true);
  const area = await mkArea(leader.id);
  const rock = await prisma.rock.create({ data: { quarterId: quarter.id, ownerId: leader.id, title: "Rock de prueba", description: "d", deliverable: "d", doneCriteria: "d" } });
  process.env.LEADER_CHECKIN_V2 = "1";
  const posts = slackFetch(t);
  const result = await startKpiCheckins({ onlyEmail: leader.email });
  assert.deepEqual(result.sent, [leader.name]);
  assert.deepEqual(result.legacyFallback, []);
  const session = await prisma.kpiCheckinSession.findFirstOrThrow({ where: { userId: leader.id } });
  const prep = await prisma.leaderPrep.findFirstOrThrow({ where: { areaId: area.id } });
  assert.equal(prep.leaderId, leader.id);
  assert.equal(prep.status, "draft");
  assert.equal(((prep.blocks as { rock?: { rock?: { id: string } } }).rock?.rock?.id), rock.id);
  assert.equal(session.step, "prep_rock");
  assert.match(posts[0], /Rock de prueba/);
  const meetingId = prep.meetingId;
  created.meetings.push(meetingId);
});
