import test from "node:test";
import assert from "node:assert/strict";
import { calculatePipelineMetrics, rate, type DemoMeeting } from "./hubspot";

const period = { start: "2026-10-01T06:00:00.000Z", end: "2026-10-31T06:00:00.000Z" };
const m = (id: string, outcome: string, title = "¡Decisiones acertadas!"): DemoMeeting => ({ id, title, startTime: "2026-10-05T16:00:00Z", outcome });
const run = (demoMeetings: DemoMeeting[], won = 0) =>
  calculatePipelineMetrics({ leads: [], wonDealsInPeriod: Array.from({ length: won }, () => ({ dealstage: "closedwon" })), demoMeetings, period });

test("show rate: no-show queda en el denominador; cancelada y reprogramada no cuentan como programadas", () => {
  const r = run([m("1", "COMPLETED"), m("2", "COMPLETED"), m("3", "NO_SHOW"), m("4", "RESCHEDULED"), m("5", "CANCELED"), m("6", "COMPLETED", "Cancelado: ¡Decisiones!")]);
  assert.deepEqual(r.showRateDetail, { numerator: 2, denominator: 3 });
  assert.ok(Math.abs((r.showRate as number) - 66.666) < 0.01);
});

test("sin citas: sin muestra (null), nunca 0%", () => {
  const r = run([]);
  assert.equal(r.showRate, null);
  assert.equal(r.closeRate, null);
  assert.equal(rate(0, 0), null);
  assert.equal(rate(0, 5), 0);
});

test("cierre operativo = ventas del mes / demos realizadas del mes, rotulado como no-cohorte", () => {
  const r = run([m("1", "COMPLETED"), m("2", "COMPLETED"), m("3", "COMPLETED"), m("4", "COMPLETED")], 1);
  assert.deepEqual(r.closeRateDetail, { numerator: 1, denominator: 4 });
  assert.equal(r.closeRate, 25);
  assert.equal(r.definitionStatus, "pending_validation");
});

test("una cita reprogramada no se cuenta dos veces", () => {
  const r = run([m("1", "RESCHEDULED"), m("1b", "COMPLETED")]);
  assert.deepEqual(r.showRateDetail, { numerator: 1, denominator: 1 });
});
