import assert from "node:assert/strict";
import { afterEach, beforeEach, test, type TestContext } from "node:test";
import {
  extractCheckinFields, generateWeeklyDigest, postSlackMessage,
  processCheckinEvent, queryWeeklyCheckins,
} from "./checkin";
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
  await processCheckinEvent({ type: "message", user: "U1", text: "Energía 4", channel: "C1", ts: String(new Date("2026-09-11T02:00:00Z").getTime() / 1000) });
  const write = calls.find((c) => c.url.endsWith("/v1/pages"))!;
  const props = write.body.properties as Record<string, unknown>;
  assert.deepEqual(props.Fecha, { date: { start: "2026-09-10" } });
  assert.deepEqual(props.Tipo, { select: { name: "Jueves" } });
  assert.equal(calls.some((c) => c.url.includes("chat.postMessage")), false);
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
