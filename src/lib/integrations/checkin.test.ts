import assert from "node:assert/strict";
import { afterEach, beforeEach, test, type TestContext } from "node:test";
import {
  extractCheckinFields, generateWeeklyDigest, postSlackMessage,
  processCheckinDelete, processCheckinEdit, processCheckinEvent, queryWeeklyCheckins,
  type CheckinDeps, type CheckinFields, type SlackMessageEvent,
} from "./checkin";
import type { CheckinStore, EvidenceRecord, MemberMatch } from "./checkinStore";
import {
  classifySlackEvent, receiveSlackEvent, type EventProcessors, type SlackEventRow, type SlackEventStore,
} from "./slackEvents";
import { crWeekStart } from "../time/costaRica";
import { checkinDate, digestHeader, digestPeriod, digestStats, groupCheckins, type CheckinRow } from "./checkinDigest";
import { GET as digestRoute } from "../../app/api/checkin/digest/route";

const envNames = ["ANTHROPIC_API_KEY", "CHECKIN_CHANNEL_ID", "NOTION_API_KEY", "NOTION_DATABASE_ID", "SLACK_BOT_TOKEN", "CRON_SECRET"];
let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) process.env[name] = "test-value";
});
afterEach(() => {
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

type Call = { url: string; body: Record<string, unknown> };
function fakeFetch(t: TestContext, handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
    calls.push(call);
    return handler(call);
  });
  return calls;
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
const row = (overrides: Partial<CheckinRow> = {}): CheckinRow => ({
  persona: "Ana", tipo: "Jueves", fecha: "2026-09-10", energia: 4,
  porQue: "Buen avance", win: "Entrega completada", reto: null, ...overrides,
});
const notionRow = (r: CheckinRow) => ({
  created_time: r.createdAt,
  properties: {
    Persona: { rich_text: [{ plain_text: r.persona }] },
    Tipo: { select: { name: r.tipo } }, Fecha: { date: { start: r.fecha } },
    "Energía": { number: r.energia }, "Por qué": { rich_text: [{ plain_text: r.porQue ?? "" }] },
    Win: { rich_text: [{ plain_text: r.win ?? "" }] }, Reto: { rich_text: [{ plain_text: r.reto ?? "" }] },
  },
});
const monday = new Date("2026-09-14T14:00:00Z");

test("uses the Costa Rica message date and non-overlapping complete weeks", () => {
  assert.equal(checkinDate(new Date("2026-09-11T02:00:00Z")), "2026-09-10");
  const period = digestPeriod(monday);
  assert.deepEqual(period, { from: "2026-09-07", through: "2026-09-13", before: "2026-09-14", previousFrom: "2026-08-31" });
  assert.equal(digestPeriod(new Date("2026-09-21T14:00:00Z")).from, period.before);
  assert.equal(digestPeriod(new Date("2027-01-04T14:00:00Z")).from, "2026-12-28");
});

test("late replies keep the Thursday type and optional missing fields", async (t) => {
  const calls = fakeFetch(t, () => json({ content: [{ type: "text", text: JSON.stringify({
    es_checkin: true, tipo: "Viernes", energia: 9, win: "  Terminamos el onboarding  ",
  }) }] }));
  const fields = await extractCheckinFields("Terminamos el onboarding", "Ana", new Date("2026-09-12T01:00:00Z"));
  assert.deepEqual(fields, { es_checkin: true, tipo: "Jueves", energia: null, por_que: null, win: "Terminamos el onboarding", reto: null });
  assert.match(JSON.stringify(calls[0].body.messages), /2026-09-11.*viernes/);
});

test("persists the event's local date rather than the server processing date", async (t) => {
  const calls = fakeFetch(t, ({ url }) => {
    if (url.includes("users.info")) return json({ user: { real_name: "Ana" } });
    if (url.includes("anthropic.com")) return json({ content: [{ type: "text", text: '{"es_checkin":true,"energia":4}' }] });
    if (url.endsWith("/v1/pages")) return json({ id: "new-checkin" });
    assert.fail(`Unexpected request: ${url}`);
  });
  const store = memoryStore();
  await processCheckinEvent(
    { type: "message", user: "U1", text: "Energía 4", channel: "C1", ts: String(new Date("2026-09-11T02:00:00Z").getTime() / 1000) },
    { store, getPermalink: async () => null },
  );
  const write = calls.find((c) => c.url.endsWith("/v1/pages"))!;
  const props = write.body.properties as Record<string, unknown>;
  assert.deepEqual(props.Fecha, { date: { start: "2026-09-10" } });
  assert.deepEqual(props.Tipo, { select: { name: "Jueves" } });
  assert.equal(calls.some((c) => c.url.includes("chat.postMessage")), false);
  assert.equal(store.rows.size, 1);
});

test("ignores casual messages and malformed model output", async (t) => {
  let output = '{"es_checkin":false}';
  fakeFetch(t, () => json({ content: [{ type: "text", text: output }] }));
  assert.equal((await extractCheckinFields("Hola", "Ana"))?.tipo, "Otro");
  output = '{"energia":4}';
  assert.equal(await extractCheckinFields("Hola", "Ana"), null);
  output = 'null';
  assert.equal(await extractCheckinFields("Hola", "Ana"), null);
});

test("repeated replies don't overweight participation or energy, including legacy types", () => {
  const rows = [
    row({ energia: 2, tipo: "Miércoles", fecha: "2026-09-09" }),
    row({ persona: " ana ", energia: 5, createdAt: "2026-09-10T20:00:00Z" }),
    row({ energia: 3, createdAt: "2026-09-10T18:00:00Z" }),
    row({ persona: "Beto", energia: 1, tipo: "Viernes" }),
    row({ persona: "Caro", energia: null }),
  ];
  const stats = digestStats(rows, []);
  assert.equal(stats.participants, 3);
  assert.equal(stats.energyCount, 2);
  assert.equal(stats.average, 3);
  assert.equal(stats.lowEnergyCount, 1);
  assert.equal(groupCheckins(rows)[0].wins.length, 1);
  assert.deepEqual(rows[0].energia, 2); // no mutation of source rows
});

test("energy comparison uses only people with valid data in both periods", () => {
  const stats = digestStats(
    [row({ energia: 4 }), row({ persona: "Beto", energia: 3 }), row({ persona: "Nueva", energia: 1 })],
    [row({ energia: 2 }), row({ persona: "Beto", energia: 3 }), row({ persona: "Ausente", energia: 5 })],
  );
  assert.equal(stats.comparisonCount, 2);
  assert.equal(stats.change, 1);
  assert.equal(digestStats([row()], [row()]).change, null);
  assert.equal(digestStats([row({ energia: NaN }), row({ persona: "Beto", energia: 0 })], []).energyCount, 0);
  assert.doesNotMatch(digestHeader([row({ energia: null })], [], digestPeriod(monday)), /NaN|null\/5|—\/5/);
});

test("Notion query reads past 100 rows, preserves rich text, and bounds dates", async (t) => {
  const calls = fakeFetch(t, ({ body }) => body.start_cursor
    ? json({ results: [notionRow(row({ persona: "Última" }))], has_more: false })
    : json({ results: Array.from({ length: 100 }, () => {
      const item = notionRow(row());
      item.properties.Win.rich_text = [{ plain_text: "Lanzamos " }, { plain_text: "el producto" }];
      return item;
    }), has_more: true, next_cursor: "page-2" }));
  const rows = await queryWeeklyCheckins("2026-08-31", "2026-09-14");
  assert.equal(rows.length, 101);
  assert.equal(rows[0].win, "Lanzamos el producto");
  assert.equal(rows[100].persona, "Última");
  assert.equal(calls[1].body.start_cursor, "page-2");
  assert.deepEqual(calls[0].body.filter, { and: [
    { property: "Fecha", date: { on_or_after: "2026-08-31" } },
    { property: "Fecha", date: { before: "2026-09-14" } },
  ] });
});

test("dry-run computes the header, separates periods, and never sends Slack messages", async (t) => {
  const calls = fakeFetch(t, ({ url }) => {
    if (url.includes("notion.com")) return json({ results: [
      notionRow(row()), notionRow(row({ energia: 5, fecha: "2026-09-11" })),
      notionRow(row({ persona: "Beto", energia: 1 })),
      notionRow(row({ fecha: "2026-09-03", win: "Logro anterior", energia: 2 })),
      notionRow(row({ fecha: "2026-09-14", persona: "Fuera del período" })),
    ], has_more: false });
    if (url.includes("anthropic.com")) return json({ content: [{ type: "text", text: "🏆 *Lo que avanzó*\n• Ana completó la entrega." }] });
    assert.fail(`Preview attempted an unexpected request: ${url}`);
  });
  const result = await generateWeeklyDigest({ dryRun: true, now: monday });
  assert.equal(result.posted, false);
  assert.equal(result.count, 3);
  assert.equal(result.participants, 2);
  assert.match(result.text, /3\.0\/5/);
  assert.match(result.text, /Ana completó la entrega/);
  assert.doesNotMatch(result.text, /Logro anterior|Fuera del período/);
  assert.equal(calls.length, 2);
});

for (const failure of ["network", "http", "empty", "truncated", "no-key"]) {
  test(`digest still renders factual content when Claude fails: ${failure}`, async (t) => {
    if (failure === "no-key") delete process.env.ANTHROPIC_API_KEY;
    fakeFetch(t, ({ url }) => {
      if (url.includes("notion.com")) return json({ results: [notionRow(row({
        persona: "Ana <!channel>", win: "Me recuperé de un problema personal",
        reto: "Tengo un problema de salud. Necesito que revisen el onboarding.",
      }))] });
      assert.ok(url.includes("anthropic.com"));
      if (failure === "network") throw new Error("Network unavailable");
      if (failure === "http") return json({ error: "Unavailable" }, 503);
      return json({ stop_reason: failure === "truncated" ? "max_tokens" : "end_turn", content: [{ type: "text", text: failure === "empty" ? " " : "Resumen incompleto" }] });
    });
    const result = await generateWeeklyDigest({ dryRun: true, now: monday });
    assert.match(result.text, /4\.0\/5/);
    assert.match(result.text, /Ana &lt;!channel&gt;/);
    assert.doesNotMatch(result.text, /Resumen incompleto|<!channel>|problema de salud|problema personal/);
    assert.ok(result.text.indexOf("Retos compartidos") < result.text.indexOf("Avances del equipo"));
  });
}

test("empty periods are reported without inventing a team status or calling Claude", async (t) => {
  const calls = fakeFetch(t, () => json({ results: [] }));
  const result = await generateWeeklyDigest({ dryRun: true, now: monday });
  assert.equal(result.count, 0);
  assert.match(result.text, /No hubo check-ins registrados/);
  assert.equal(calls.length, 1);
});

test("Slack API errors with HTTP 200 are not reported as a successful publication", async (t) => {
  fakeFetch(t, () => json({ ok: false, error: "channel_not_found" }));
  await assert.rejects(() => postSlackMessage("C1", "Resumen"), /channel_not_found/);
});

test("successful publication sends exactly the text that was rendered", async (t) => {
  delete process.env.ANTHROPIC_API_KEY;
  const calls = fakeFetch(t, ({ url }) => url.includes("notion.com")
    ? json({ results: [notionRow(row())] }) : json({ ok: true }));
  const result = await generateWeeklyDigest({ now: monday });
  assert.equal(result.posted, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.text, result.text);
});

test("the digest endpoint requires a configured secret, including previews", async (t) => {
  fakeFetch(t, ({ url }) => assert.fail(`Unauthorized request reached ${url}`));
  const request = new Request("https://example.test/api/checkin/digest?dryRun=1");
  assert.equal((await digestRoute(request)).status, 401);
  delete process.env.CRON_SECRET;
  assert.equal((await digestRoute(request)).status, 401);
});

test("an authenticated preview request does not publish anything", async (t) => {
  const calls = fakeFetch(t, ({ url }) => {
    assert.ok(url.includes("notion.com"), `Unexpected request in dry-run: ${url}`);
    return json({ results: [] });
  });
  const response = await digestRoute(new Request("https://example.test/api/checkin/digest?dryRun=1", {
    headers: { authorization: "Bearer test-value" },
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).posted, false);
  assert.equal(calls.length, 1);
});

test("the fallback lists every person with a challenge without copying personal details", async (t) => {
  delete process.env.ANTHROPIC_API_KEY;
  fakeFetch(t, () => json({ results: Array.from({ length: 8 }, (_, i) => notionRow(row({
    persona: `Persona ${i + 1}`, reto: "Asunto familiar; también necesito un acceso laboral.",
  }))) }));
  const result = await generateWeeklyDigest({ dryRun: true, now: monday });
  for (let i = 1; i <= 8; i++) assert.ok(result.text.includes(`Persona ${i}`));
  assert.doesNotMatch(result.text, /Asunto familiar/);
});

// ---------------------------------------------------------------------------
// Captura duradera: evidencia en EOS primero, idempotencia, ediciones, borrados
// ---------------------------------------------------------------------------

function memoryStore(members: Record<string, MemberMatch> = {}): CheckinStore & { rows: Map<string, EvidenceRecord> } {
  const rows = new Map<string, EvidenceRecord>();
  let seq = 0;
  return {
    rows,
    async findEvidence(channelId, ts) { return rows.get(`${channelId}:${ts}`) ?? null; },
    async createEvidence(data) {
      const key = `${data.channelId}:${data.messageTs}`;
      const existing = rows.get(key);
      if (existing) return { record: existing, created: false };
      const record: EvidenceRecord = { ...data, id: `ev${++seq}`, notionPageId: null, revisions: [], deletedAt: null };
      rows.set(key, record);
      return { record, created: true };
    },
    async updateEvidence(id, patch) {
      const entry = [...rows.entries()].find(([, r]) => r.id === id)!;
      const next = { ...entry[1], ...patch };
      rows.set(entry[0], next);
      return next;
    },
    async resolveMember(slackUserId) { return members[slackUserId] ?? null; },
  };
}

type Harness = { deps: Partial<CheckinDeps>; store: ReturnType<typeof memoryStore>; notion: { created: number; updates: Array<{ id: string; win: string | null; reto: string | null }>; failNext: boolean } };
function harness(opts: { members?: Record<string, MemberMatch>; fields?: Partial<CheckinFields> | null; permalinkFails?: boolean } = {}): Harness {
  const store = memoryStore(opts.members);
  const notion = { created: 0, updates: [] as Array<{ id: string; win: string | null; reto: string | null }>, failNext: false };
  const base: CheckinFields = { tipo: "Jueves", energia: 3, por_que: "motivo personal", win: "Cerramos el piloto", reto: null, es_checkin: true };
  const deps: Partial<CheckinDeps> = {
    store,
    now: () => new Date("2026-09-12T15:00:00Z"),
    getUserName: async () => "Ana Pérez",
    extract: async (text) => opts.fields === null ? null : { ...base, ...opts.fields, win: opts.fields?.win !== undefined ? opts.fields.win : text.includes("v2") ? "Cerramos el piloto y lo escalamos" : base.win },
    getPermalink: async () => { if (opts.permalinkFails) throw new Error("slack down"); return "https://slack.test/p1"; },
    createNotionPage: async () => {
      if (notion.failNext) { notion.failNext = false; throw new Error("Notion down"); }
      notion.created += 1;
      return `page-${notion.created}`;
    },
    updateNotionPage: async (id, f) => { notion.updates.push({ id, ...f }); },
  };
  return { deps, store, notion };
}
const ts = (iso: string) => String(new Date(iso).getTime() / 1000);
const msg = (over: Partial<SlackMessageEvent> = {}): SlackMessageEvent => ({
  type: "message", user: "U1", text: "Energía 3. Cerramos el piloto", channel: "C1", ts: ts("2026-09-10T15:30:00Z"), ...over,
});

test("evidence is saved first with the verbatim original, permalink and no energy field", async () => {
  const h = harness({ members: { U1: { userId: "user-1", areaKey: "ventas" } } });
  await processCheckinEvent(msg(), h.deps);
  const row = [...h.store.rows.values()][0];
  assert.equal(row.originalText, "Energía 3. Cerramos el piloto");
  assert.equal(row.win, "Cerramos el piloto");
  assert.equal(row.userId, "user-1");
  assert.equal(row.areaKey, "ventas");
  assert.equal(row.permalink, "https://slack.test/p1");
  assert.equal(row.notionPageId, "page-1");
  assert.equal(JSON.stringify(row).includes("motivo personal"), false);
  assert.equal("energia" in row, false);
});

test("a duplicate delivery of the same message creates one evidence row and one Notion page", async () => {
  const h = harness();
  await processCheckinEvent(msg(), h.deps);
  await processCheckinEvent(msg(), h.deps);
  assert.equal(h.store.rows.size, 1);
  assert.equal(h.notion.created, 1);
});

test("when Notion fails the evidence stays saved and the retry fills the same row/page once", async () => {
  const h = harness();
  h.notion.failNext = true;
  await assert.rejects(() => processCheckinEvent(msg(), h.deps), /notion failed/);
  const [saved] = [...h.store.rows.values()];
  assert.ok(saved, "evidence persisted before Notion");
  assert.equal(saved.notionPageId, null);
  await processCheckinEvent(msg(), h.deps);
  assert.equal(h.store.rows.size, 1);
  assert.equal(h.notion.created, 1);
  assert.equal([...h.store.rows.values()][0].notionPageId, "page-1");
});

test("an unknown Slack user stays pending: never matched by display name", async () => {
  const h = harness({ members: { UOTHER: { userId: "u9", areaKey: "growth" } } });
  await processCheckinEvent(msg({ user: "U404" }), h.deps);
  const row = [...h.store.rows.values()][0];
  assert.equal(row.userId, null);
  assert.equal(row.areaKey, null);
  assert.equal(row.authorName, "Ana Pérez"); // el nombre es solo informativo
});

test("a failing permalink lookup never blocks the capture", async () => {
  const h = harness({ permalinkFails: true });
  await processCheckinEvent(msg(), h.deps);
  assert.equal([...h.store.rows.values()][0].permalink, null);
  assert.equal(h.notion.created, 1);
});

test("non check-in messages are ignored and a failed extraction is retryable, not silently dropped", async () => {
  const ignored = harness({ fields: { es_checkin: false, tipo: "Otro" } });
  await processCheckinEvent(msg({ text: "gracias!" }), ignored.deps);
  assert.equal(ignored.store.rows.size, 0);
  assert.equal(ignored.notion.created, 0);
  const failed = harness({ fields: null });
  await assert.rejects(() => processCheckinEvent(msg(), failed.deps), /claude failed/);
  assert.equal(failed.store.rows.size, 0);
});

test("period assignment: Thursday, Saturday and Monday replies stay in their Thursday's week", async () => {
  const cases: Array<[string, string]> = [
    ["2026-09-10T15:30:00Z", "2026-09-07"], // jueves
    ["2026-09-12T18:00:00Z", "2026-09-07"], // sábado tardío
    ["2026-09-14T14:00:00Z", "2026-09-07"], // lunes tardío
    ["2026-09-17T15:30:00Z", "2026-09-14"], // jueves siguiente
  ];
  for (const [iso, weekMonday] of cases) {
    const h = harness();
    await processCheckinEvent(msg({ ts: ts(iso) }), h.deps);
    const row = [...h.store.rows.values()][0];
    assert.equal(row.periodStart.getTime(), crWeekStart(new Date(`${weekMonday}T18:00:00Z`)).getTime(), iso);
    assert.equal(row.reportedAt.toISOString(), iso.replace("Z", ".000Z"));
  }
});

test("a thread reply attaches to the question's period and keeps its own original text", async () => {
  const h = harness();
  await processCheckinEvent(msg({ ts: ts("2026-09-15T14:00:00Z"), thread_ts: ts("2026-09-10T15:02:00Z") }), h.deps);
  const row = [...h.store.rows.values()][0];
  assert.equal(row.periodStart.getTime(), crWeekStart(new Date("2026-09-10T18:00:00Z")).getTime());
  assert.equal(row.originalText, "Energía 3. Cerramos el piloto");
});

test("an edit appends a revision, keeps the original, and patches the same Notion page", async () => {
  const h = harness();
  const original = msg();
  await processCheckinEvent(original, h.deps);
  await processCheckinEdit(
    { type: "message", subtype: "message_changed", channel: "C1", user: "", text: "", ts: ts("2026-09-10T16:00:00Z"),
      message: { user: "U1", text: "Energía 3. Cerramos el piloto v2", ts: original.ts } },
    h.deps,
  );
  const row = [...h.store.rows.values()][0];
  assert.equal(row.originalText, "Energía 3. Cerramos el piloto");
  assert.equal(row.revisions.length, 1);
  assert.equal(row.revisions[0].text, "Energía 3. Cerramos el piloto v2");
  assert.equal(row.win, "Cerramos el piloto y lo escalamos");
  assert.deepEqual(h.notion.updates, [{ id: "page-1", win: "Cerramos el piloto y lo escalamos", reto: null }]);
  // Mismo texto (p. ej. previsualización de enlace) no agrega revisión.
  await processCheckinEdit(
    { type: "message", subtype: "message_changed", channel: "C1", user: "", text: "", ts: original.ts,
      message: { user: "U1", text: "Energía 3. Cerramos el piloto v2", ts: original.ts } },
    h.deps,
  );
  assert.equal([...h.store.rows.values()][0].revisions.length, 1);
});

test("a failing Notion patch on edit does not lose the revision", async () => {
  const h = harness();
  const original = msg();
  await processCheckinEvent(original, h.deps);
  h.deps.updateNotionPage = async () => { throw new Error("Notion down"); };
  await processCheckinEdit(
    { type: "message", subtype: "message_changed", channel: "C1", user: "", text: "", ts: original.ts,
      message: { user: "U1", text: "otro texto v2", ts: original.ts } },
    h.deps,
  );
  assert.equal([...h.store.rows.values()][0].revisions.length, 1);
});

test("edits of messages that were never check-ins are ignored", async () => {
  const h = harness();
  await processCheckinEdit(
    { type: "message", subtype: "message_changed", channel: "C1", user: "", text: "", ts: "1.0", message: { user: "U1", text: "hola", ts: "9.9" } },
    h.deps,
  );
  assert.equal(h.store.rows.size, 0);
});

test("a delete only sets deletedAt and keeps the row, text and revisions", async () => {
  const h = harness();
  const original = msg();
  await processCheckinEvent(original, h.deps);
  await processCheckinDelete({ type: "message", subtype: "message_deleted", channel: "C1", user: "", text: "", ts: "1.0", deleted_ts: original.ts }, h.deps);
  const row = [...h.store.rows.values()][0];
  assert.equal(h.store.rows.size, 1);
  assert.ok(row.deletedAt instanceof Date);
  assert.equal(row.originalText, "Energía 3. Cerramos el piloto");
});

// --- Recepción de eventos (SlackEvent) ---------------------------------------

function eventStore(): SlackEventStore & { rows: Map<string, SlackEventRow & { lastError: string | null }> } {
  const rows = new Map<string, SlackEventRow & { lastError: string | null }>();
  return {
    rows,
    async create(data) {
      const existing = rows.get(data.eventId);
      if (existing) return { row: existing, created: false };
      const row = { eventId: data.eventId, processedAt: null, attempts: 0, lastError: null };
      rows.set(data.eventId, row);
      return { row, created: true };
    },
    async markAttempt(id) { rows.get(id)!.attempts += 1; },
    async markProcessed(id) { const r = rows.get(id)!; r.processedAt = new Date(); r.lastError = null; },
    async markFailed(id, err) { rows.get(id)!.lastError = err; },
  };
}

function receiver(fail = false) {
  const store = eventStore();
  const seen: string[] = [];
  const pending: Array<Promise<void>> = [];
  const processors: EventProcessors = {
    dm: async () => { seen.push("dm"); },
    checkin_message: async () => { seen.push("message"); if (fail) throw new Error("secreto: texto del mensaje"); },
    checkin_edit: async () => { seen.push("edit"); },
    checkin_delete: async () => { seen.push("delete"); },
  };
  const receive = (body: Parameters<typeof receiveSlackEvent>[0], persistFails = false) => receiveSlackEvent(body, {
    store: persistFails ? { ...store, create: async () => { throw new Error("db down"); } } : store,
    processors,
    checkinChannel: "C1",
    schedule: (task) => { pending.push(task()); },
  });
  return { store, seen, receive, settle: () => Promise.all(pending) };
}

test("the event is persisted before acking and a duplicate of a processed event is a no-op", async () => {
  const r = receiver();
  const body = { event_id: "Ev1", event: msg() };
  assert.deepEqual(await r.receive(body), { status: 200, outcome: "scheduled" });
  await r.settle();
  assert.ok(r.store.rows.get("Ev1")!.processedAt);
  assert.deepEqual(await r.receive(body), { status: 200, outcome: "duplicate" });
  await r.settle();
  assert.deepEqual(r.seen, ["message"]);
});

test("Slack retry headers no longer drop events: an unprocessed event is reprocessed by id", async () => {
  const r = receiver(true);
  const body = { event_id: "Ev2", event: msg() };
  await r.receive(body);
  await r.settle();
  const row = r.store.rows.get("Ev2")!;
  assert.equal(row.processedAt, null);
  assert.equal(row.attempts, 1);
  assert.ok(row.lastError);
  assert.doesNotMatch(row.lastError!, /secreto|texto/); // sin texto de mensajes
  assert.deepEqual(await r.receive(body), { status: 200, outcome: "scheduled" });
  await r.settle();
  assert.equal(row.attempts, 2);
});

test("if the event can't be persisted Slack gets a 5xx so it retries", async () => {
  const r = receiver();
  assert.deepEqual(await r.receive({ event_id: "Ev3", event: msg() }, true), { status: 500, outcome: "persist_failed" });
  assert.deepEqual(r.seen, []);
});

test("bot messages, other channels and joins are ignored; edits and deletes are routed", async () => {
  const r = receiver();
  await r.receive({ event_id: "a", event: msg({ bot_id: "B1" }) });
  await r.receive({ event_id: "b", event: msg({ channel: "C9" }) });
  await r.receive({ event_id: "c", event: msg({ subtype: "channel_join" }) });
  await r.receive({ event_id: "d", event: { ...msg(), subtype: "message_changed", message: { ts: "1.1", text: "x", bot_id: "B1" } } });
  assert.equal(r.store.rows.size, 0);
  await r.receive({ event_id: "e", event: { ...msg(), subtype: "message_changed", message: { ts: "1.1", text: "x", user: "U1" } } });
  await r.receive({ event_id: "f", event: { ...msg(), subtype: "message_deleted", deleted_ts: "1.1" } });
  await r.receive({ event_id: "g", event: msg({ channel: "D1", channel_type: "im" }) });
  await r.settle();
  assert.deepEqual(r.seen, ["edit", "delete", "dm"]);
  assert.equal(classifySlackEvent(msg({ channel: "D1", channel_type: "im", bot_id: "B1" }), "C1"), null);
});

test("a DM retry is not executed twice once an attempt was made", async () => {
  const r = receiver();
  const body = { event_id: "Dm1", event: msg({ channel: "D1", channel_type: "im" }) };
  await r.receive(body);
  await r.settle();
  r.store.rows.get("Dm1")!.processedAt = null; // simula un fallo posterior
  assert.deepEqual(await r.receive(body), { status: 200, outcome: "duplicate" });
  assert.deepEqual(r.seen, ["dm"]);
});
