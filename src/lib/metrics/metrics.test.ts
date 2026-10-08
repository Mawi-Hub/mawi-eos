import test from "node:test";
import assert from "node:assert/strict";
import { rateFromCounts, resolveDataState, isActionableState } from "./dataState";
import { aggregateEntries, toPlanValue, toPercent100 } from "./aggregation";
import { describePeriod, formatMetricValue } from "./format";

test("denominador cero produce sin muestra, no 0%", () => {
  assert.deepEqual(rateFromCounts(0, 0), { value: null, state: "no_sample" });
  assert.deepEqual(rateFromCounts(0, 4), { value: 0, state: "confirmed_zero" });
  assert.equal(rateFromCounts(3, 4).value, 75);
});

test("cero confirmado, ausente, error y viejo se distinguen", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const fresh = new Date("2026-10-08T12:00:00Z");
  assert.equal(resolveDataState(null), "pending");
  assert.equal(resolveDataState({ actualValue: null }), "pending");
  assert.equal(resolveDataState({ actualValue: 0, dataState: "confirmed_zero", updatedAt: fresh }, { now }), "confirmed_zero");
  assert.equal(resolveDataState({ actualValue: null, dataState: "error" }), "error");
  assert.equal(resolveDataState({ actualValue: 5, updatedAt: new Date("2026-08-01T00:00:00Z") }, { frequency: "weekly", now }), "stale");
  assert.equal(resolveDataState({ actualValue: 5, updatedAt: fresh }, { frequency: "weekly", now }), "value");
});

test("un cero sincronizado sin confirmación no se presenta como resultado", () => {
  const state = resolveDataState({ actualValue: 0, updatedAt: new Date() }, { autoSynced: true });
  assert.equal(state, "pending");
  assert.equal(isActionableState(state), false);
});

test("agregación explícita por métrica en vez de 'último no nulo' para todo", () => {
  const entries = [
    { periodStart: new Date("2026-10-01T06:00:00Z"), actualValue: 2 },
    { periodStart: new Date("2026-10-08T06:00:00Z"), actualValue: 4 },
    { periodStart: new Date("2026-10-15T06:00:00Z"), actualValue: null },
  ];
  const start = new Date("2026-10-01T06:00:00Z");
  const end = new Date("2026-11-01T06:00:00Z");
  assert.equal(aggregateEntries(entries, "last", start, end), 4);
  assert.equal(aggregateEntries(entries, "sum", start, end), 6);
  assert.equal(aggregateEntries(entries, "avg", start, end), 3);
  assert.equal(aggregateEntries(entries, "max", start, end), 4);
  assert.equal(aggregateEntries(entries, "sum", new Date("2026-11-01T06:00:00Z"), new Date("2026-12-01T06:00:00Z")), null);
});

test("escala de porcentajes 0–1 y 0–100 sin tocar lo guardado", () => {
  assert.equal(toPercent100(0.42, "0-1"), 42);
  assert.equal(toPercent100(42, "0-100"), 42);
  assert.equal(toPlanValue(42, "PCT", "%", "0-100"), 0.42);
  assert.equal(toPlanValue(0.42, "PCT", "%", "0-1"), 0.42);
  assert.equal(toPlanValue(1250, "USD", "$", "0-100"), 1250);
});

test("las métricas mensuales se rotulan mes a la fecha o último mes cerrado", () => {
  const now = { year: 2026, month: 10 };
  assert.match(describePeriod("monthly", new Date(), now, { year: 2026, month: 10, day: 1 }), /mes a la fecha/);
  assert.match(describePeriod("monthly", new Date(), now, { year: 2026, month: 9, day: 1 }), /último mes cerrado/);
  assert.match(describePeriod("weekly", new Date(), now, { year: 2026, month: 10, day: 5 }), /semana del 5 oct/);
});

test("formato de valores consistente", () => {
  assert.equal(formatMetricValue(1250, "$"), "$1,250");
  assert.equal(formatMetricValue(42.34, "%"), "42.3%");
  assert.equal(formatMetricValue(null, "%"), null);
});
