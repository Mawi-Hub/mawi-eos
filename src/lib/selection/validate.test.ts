import test from "node:test";
import assert from "node:assert/strict";
import { hasBlockingIssues, validateSelection, type CandidateRow } from "./validate";

const kpi = (id: string, over: Partial<NonNullable<CandidateRow["planKpi"]>> = {}) => ({
  id, planId: "P1", scorecardMetricId: "M-" + id, unit: "PCT", direction: "ABOVE" as const, ...over,
});

test("una selección correcta no tiene errores", () => {
  const issues = validateSelection([
    { key: "a", quarterPlanId: "P1", planKpi: kpi("1"), scorecardMetric: { id: "M-1", unit: "%", targetDirection: "above" } },
    { key: "b", quarterPlanId: "P1", proposalKey: "growth_leads" },
  ]);
  assert.equal(hasBlockingIssues(issues), false);
});

test("rechaza duplicados, otro plan y mapeos ambiguos", () => {
  const issues = validateSelection([
    { key: "a", quarterPlanId: "P1", planKpi: kpi("1"), scorecardMetric: { id: "M-1", unit: "%", targetDirection: "above" } },
    { key: "b", quarterPlanId: "P1", planKpi: kpi("1"), scorecardMetric: { id: "M-1", unit: "%", targetDirection: "above" } },
    { key: "c", quarterPlanId: "P1", planKpi: kpi("2", { planId: "OTRO" }) },
    { key: "d", quarterPlanId: "P1", planKpi: kpi("3", { scorecardMetricId: "M-OTRA" }), scorecardMetric: { id: "M-3", unit: "%", targetDirection: "above" } },
  ]);
  const codes = issues.map((i) => i.code);
  assert.ok(codes.includes("duplicate_kpi"));
  assert.ok(codes.includes("duplicate_metric"));
  assert.ok(codes.includes("other_plan"));
  assert.ok(codes.includes("ambiguous_mapping"));
  assert.equal(hasBlockingIssues(issues), true);
});

test("un KPI sin mapeo queda para revisión, no se crea otra métrica", () => {
  const issues = validateSelection([{ key: "a", quarterPlanId: "P1", planKpi: kpi("9", { scorecardMetricId: null }) }]);
  assert.deepEqual(issues.map((i) => [i.code, i.level]), [["unmapped", "review"]]);
});

test("avisa de unidad o sentido de mejora distintos", () => {
  const issues = validateSelection([
    { key: "a", quarterPlanId: "P1", planKpi: kpi("1", { unit: "USD" }), scorecardMetric: { id: "M-1", unit: "%", targetDirection: "below" } },
  ]);
  const codes = issues.map((i) => i.code);
  assert.ok(codes.includes("unit_mismatch"));
  assert.ok(codes.includes("direction_mismatch"));
});
