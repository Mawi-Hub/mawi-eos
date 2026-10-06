import assert from "node:assert/strict";
import { test } from "node:test";
import { overlayKpisWithMetrics, effectiveMonthValue, type OverlayMetric } from "./effectiveValue";
import { normalizeManualEntry } from "./manualEntry";
import { displayAreaForLegacy, groupByDisplayArea } from "./legacyArea";
import { resolveQuarter } from "./quarterPick";
import { kpiInSelection } from "./selectionMembership";

const d = (y: number, m: number, day = 1) => new Date(Date.UTC(y, m - 1, day));

function metric(over: Partial<OverlayMetric> & { entries: OverlayMetric["entries"] }): OverlayMetric {
  return { id: "m1", name: "Metric", unit: "%", aggregation: "last", percentScale: "0-100", ...over };
}
function kpi(over: Record<string, unknown> = {}) {
  return {
    sourceType: "SCORECARD",
    sourceKey: "Metric",
    scorecardMetricId: null as string | null,
    unit: "PCT",
    entries: [{ period: d(2026, 9), projected: 0.5, actual: null as number | null }],
    ...over,
  };
}
const weekly = [
  { periodStart: d(2026, 9, 1), actualValue: 10, dataState: null },
  { periodStart: d(2026, 9, 8), actualValue: 20, dataState: null },
  { periodStart: d(2026, 9, 15), actualValue: 30, dataState: null },
];

test("aggregation modes", () => {
  const val = (aggregation: string) => effectiveMonthValue(metric({ aggregation, unit: "count", entries: weekly }), "count", d(2026, 9));
  assert.equal(val("last"), 30);
  assert.equal(val("sum"), 60);
  assert.equal(val("avg"), 20);
  assert.equal(val("max"), 30);
  assert.equal(val("garbage"), 30); // desconocida = last
});

test("percent scale 0-100 vs 0-1", () => {
  const e = [{ periodStart: d(2026, 9, 1), actualValue: 45, dataState: null }];
  assert.equal(effectiveMonthValue(metric({ entries: e }), "PCT", d(2026, 9)), 0.45);
  const e2 = [{ periodStart: d(2026, 9, 1), actualValue: 0.45, dataState: null }];
  assert.equal(effectiveMonthValue(metric({ percentScale: "0-1", entries: e2 }), "PCT", d(2026, 9)), 0.45);
});

test("maps by scorecardMetricId over name", () => {
  const byName = metric({ id: "a", name: "Metric", entries: [{ periodStart: d(2026, 9), actualValue: 10, dataState: null }] });
  const byId = metric({ id: "b", name: "Other", entries: [{ periodStart: d(2026, 9), actualValue: 70, dataState: null }] });
  const [out] = overlayKpisWithMetrics([kpi({ scorecardMetricId: "b" })], [byName, byId]);
  assert.equal(out.entries[0].actual, 0.7);
  // sin id mapeado cae al nombre
  const [fallback] = overlayKpisWithMetrics([kpi({ scorecardMetricId: "missing" })], [byName, byId]);
  assert.equal(fallback.entries[0].actual, 0.1);
});

test("non-value data states are not overlaid, confirmed_zero is", () => {
  const states = ["pending", "no_sample", "error", "not_applicable", "stale"];
  for (const dataState of states) {
    const m = metric({ entries: [{ periodStart: d(2026, 9), actualValue: 50, dataState }] });
    const [out] = overlayKpisWithMetrics([kpi()], [m]);
    assert.equal(out.entries[0].actual, null, dataState);
  }
  const nullValue = metric({ entries: [{ periodStart: d(2026, 9), actualValue: null, dataState: "no_sample" }] });
  assert.equal(overlayKpisWithMetrics([kpi()], [nullValue])[0].entries[0].actual, null);
  const zero = metric({ entries: [{ periodStart: d(2026, 9), actualValue: 0, dataState: "confirmed_zero" }] });
  assert.equal(overlayKpisWithMetrics([kpi()], [zero])[0].entries[0].actual, 0);
  // un no_sample reciente no tapa un valor válido anterior dentro del mes
  const mixed = metric({
    entries: [
      { periodStart: d(2026, 9, 15), actualValue: null, dataState: "no_sample" },
      { periodStart: d(2026, 9, 8), actualValue: 40, dataState: null },
    ],
  });
  assert.equal(overlayKpisWithMetrics([kpi()], [mixed])[0].entries[0].actual, 0.4);
});

test("does not mutate inputs and keeps raw actual when no scorecard data", () => {
  const input = kpi({ entries: [{ period: d(2026, 9), projected: 0.5, actual: 0.33 }] });
  const snapshot = JSON.stringify(input);
  const m = metric({ entries: [{ periodStart: d(2026, 8), actualValue: 99, dataState: null }] });
  const [out] = overlayKpisWithMetrics([input], [m]);
  assert.equal(out.entries[0].actual, 0.33);
  assert.equal(JSON.stringify(input), snapshot);
  const [moved] = overlayKpisWithMetrics([input], [metric({ entries: weekly })]);
  assert.equal(input.entries[0].actual, 0.33);
  assert.equal(moved.entries[0].actual, 0.3);
});

test("cover, catalog and detail agree (same helper, list or single)", () => {
  const m = metric({ aggregation: "avg", entries: weekly });
  const k = kpi();
  const cover = overlayKpisWithMetrics([k, kpi({ sourceType: "MANUAL" })], [m])[0];
  const detail = overlayKpisWithMetrics([k], [m])[0];
  assert.deepEqual(cover.entries, detail.entries);
});

test("manual entry: zero, denominator 0, states", () => {
  const m = { unit: "%", percentScale: "0-100" };
  const zero = normalizeManualEntry({ actualValue: 0 }, m);
  assert.deepEqual(zero.ok && [zero.dataState, zero.provenance, zero.actualValue], ["confirmed_zero", "manual", 0]);
  const noSample = normalizeManualEntry({ actualValue: 0, numerator: 0, denominator: 0 }, m);
  assert.deepEqual(noSample.ok && [noSample.dataState, noSample.actualValue], ["no_sample", null]);
  const rate = normalizeManualEntry({ numerator: 3, denominator: 4 }, m);
  assert.deepEqual(rate.ok && [rate.actualValue, rate.dataState], [75, null]);
  const pending = normalizeManualEntry({ actualValue: 5, dataState: "pending" }, m);
  assert.deepEqual(pending.ok && [pending.actualValue, pending.dataState], [null, "pending"]);
  assert.equal(normalizeManualEntry({ dataState: "nope", actualValue: 1 }, m).ok, false);
  assert.equal(normalizeManualEntry({ dataState: "confirmed_zero", actualValue: 3 }, m).ok, false);
  assert.equal(normalizeManualEntry({}, m).ok, false);
  assert.equal(normalizeManualEntry({ actualValue: 1, denominator: -1 }, m).ok, false);
  const withProv = normalizeManualEntry({ actualValue: 7, provenance: " HubSpot nativo " }, m);
  assert.equal(withProv.ok && withProv.provenance, "HubSpot nativo");
});

test("legacy COMERCIAL split never drops items", () => {
  const ctx = { ventasUserIds: new Set(["lore"]), growthUserIds: new Set(["fede"]) };
  assert.equal(displayAreaForLegacy("COMERCIAL", { title: "x", ownerId: "lore" }, ctx), "ventas");
  assert.equal(displayAreaForLegacy("COMERCIAL", { title: "x", ownerId: "fede" }, ctx), "growth");
  assert.equal(displayAreaForLegacy("COMERCIAL", { title: "Más campañas de marketing" }, ctx), "growth");
  assert.equal(displayAreaForLegacy("COMERCIAL", { title: "Cerrar más deals del pipeline" }, ctx), "ventas");
  assert.equal(displayAreaForLegacy("COMERCIAL", { title: "Mejorar proceso" }, ctx), "comercial_sin_separar");
  assert.equal(displayAreaForLegacy("COMERCIAL", { title: "Leads para demos" }, ctx), "comercial_sin_separar");
  assert.equal(displayAreaForLegacy("NORTH_STAR", { title: "x" }, ctx), "general");
  const items = [
    { area: "COMERCIAL", title: "a" }, { area: "NORTH_STAR", title: "b" }, { area: "PRODUCTO", title: "c" },
    { area: "INGENIERIA", title: "d" }, { area: "CUSTOMER_SUCCESS", title: "e" },
  ];
  const grouped = groupByDisplayArea(items, ctx, new Set(["ventas", "customer", "producto"]));
  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);
  assert.equal(total, items.length);
  assert.equal(grouped.get("general")?.length, 2); // NORTH_STAR + ingenieria sin área conocida
});

test("quarter pick validates ?q and membership", () => {
  const qs = [
    { id: "a", year: 2026, quarter: 3, isActive: false, startDate: d(2026, 7) },
    { id: "b", year: 2026, quarter: 4, isActive: true, startDate: d(2026, 10) },
  ];
  assert.equal(resolveQuarter(qs, "a")?.id, "a");
  assert.equal(resolveQuarter(qs, "zzz")?.id, "b");
  assert.equal(resolveQuarter(qs, undefined)?.id, "b");
  assert.equal(resolveQuarter([], "a"), null);
  assert.equal(kpiInSelection({ id: "k", scorecardMetricId: "m" }, [{ planKpiId: null, scorecardMetricId: "m" }]), true);
  assert.equal(kpiInSelection({ id: "k", scorecardMetricId: null }, [{ planKpiId: null, scorecardMetricId: null }]), false);
});
