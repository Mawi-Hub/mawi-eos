import test from "node:test";
import assert from "node:assert/strict";
import { splitMetricLabel } from "./label";

test("la subárea va aparte del nombre del KPI", () => {
  assert.deepEqual(splitMetricLabel("Onboarding: Days to Activate"), { title: "Days to Activate", group: "Onboarding" });
  assert.deepEqual(splitMetricLabel("Success: churn bruto de MRR"), { title: "churn bruto de MRR", group: "Success" });
  assert.deepEqual(splitMetricLabel("Days to Activate", "Onboarding"), { title: "Days to Activate", group: "Onboarding" });
  // Un ":" que no es subárea no se toca.
  assert.deepEqual(splitMetricLabel("Ratio: CAC/LTV"), { title: "Ratio: CAC/LTV", group: null });
  assert.deepEqual(splitMetricLabel("Show rate"), { title: "Show rate", group: null });
});
