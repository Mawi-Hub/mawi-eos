import test from "node:test";
import assert from "node:assert/strict";
import { receiveSlackEvent, type ReceiveDeps } from "./slackEvents";
import type { SlackMessageEvent } from "./checkin";

function deps(isReport: (c: string, t: string) => Promise<boolean>) {
  const processed: string[] = [];
  const d: ReceiveDeps = {
    store: {
      async create(data) { return { row: { eventId: data.eventId, processedAt: null, attempts: 0 }, created: true }; },
      async markAttempt() {}, async markProcessed() {}, async markFailed() {},
    },
    isReportThread: isReport,
    checkinChannel: "C1",
    schedule: (task) => void task(),
    processors: {
      dm: async () => {},
      checkin_message: async (e) => { processed.push(`msg:${e.ts}`); },
      checkin_edit: async (e) => { processed.push(`edit:${e.message?.ts}`); },
      checkin_delete: async () => {},
    },
  };
  return { d, processed };
}

const msg = (over: Partial<SlackMessageEvent>): SlackMessageEvent => ({ type: "message", user: "U1", text: "hola", ts: "2.0", channel: "C1", channel_type: "channel", ...over });

test("una respuesta en el hilo de un resumen publicado se ignora", async () => {
  const { d, processed } = deps(async (_c, t) => t === "1.0");
  const r = await receiveSlackEvent({ event_id: "E1", event: msg({ thread_ts: "1.0" }) }, d);
  assert.equal(r.outcome, "ignored");
  assert.deepEqual(processed, []);
});

test("la edición de una respuesta en ese hilo también se ignora", async () => {
  const { d, processed } = deps(async (_c, t) => t === "1.0");
  const ev = msg({ subtype: "message_changed", message: { user: "U1", text: "x", ts: "2.0", thread_ts: "1.0" } });
  assert.equal((await receiveSlackEvent({ event_id: "E2", event: ev }, d)).outcome, "ignored");
  assert.deepEqual(processed, []);
});

test("un check-in normal (o un hilo que no es de un resumen) sigue su flujo", async () => {
  const { d, processed } = deps(async () => false);
  assert.equal((await receiveSlackEvent({ event_id: "E3", event: msg({}) }, d)).outcome, "scheduled");
  assert.equal((await receiveSlackEvent({ event_id: "E4", event: msg({ ts: "3.0", thread_ts: "9.0" }) }, d)).outcome, "scheduled");
  assert.deepEqual(processed, ["msg:2.0", "msg:3.0"]);
});

test("si la consulta del hilo falla, no se pierde el check-in", async () => {
  const { d, processed } = deps(async () => { throw new Error("db caída"); });
  assert.equal((await receiveSlackEvent({ event_id: "E5", event: msg({ thread_ts: "1.0" }) }, d)).outcome, "scheduled");
  assert.deepEqual(processed, ["msg:2.0"]);
});
