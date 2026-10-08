import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendDateChange,
  dayKey,
  lastDateChange,
  originalDueOf,
  resolveStatus,
  validateDateChangeReason,
  validateNextStep,
} from "./commitments";
import { validateCommitmentShare, validateIssueShare } from "./share";
import {
  chronicThreshold,
  frequencyFor,
  isLegacyWithoutSelection,
  metricLinkOptions,
  periodsLabel,
  redStreak,
  scopeMetrics,
  updatedForPeriod,
} from "./scope";
import { computeNdr, formatRate } from "./dashboardFormat";
import type { MetricScope } from "@/lib/selection/quarterSelection";

const legacy: MetricScope = { mode: "legacy" };
const selection = (ids: string[], hasSelection = true, rows: unknown[] = []): MetricScope =>
  ({ mode: "selection", hasSelection, metricIds: new Set(ids), selection: { quarterId: "q", planId: null, hasSelection, rows } }) as unknown as MetricScope;

test("status/done se mantienen sincronizados", () => {
  assert.deepEqual(resolveStatus({ status: "done" }), { ok: true, changed: true, status: "done", done: true });
  assert.deepEqual(resolveStatus({ status: "pending" }), { ok: true, changed: true, status: "pending", done: false });
  assert.deepEqual(resolveStatus({ done: true }), { ok: true, changed: true, status: "done", done: true });
  assert.deepEqual(resolveStatus({ done: false }, "done"), { ok: true, changed: true, status: "open", done: false });
  assert.deepEqual(resolveStatus({ done: false }, "pending"), { ok: true, changed: true, status: "pending", done: false });
  assert.deepEqual(resolveStatus({}), { ok: true, changed: false });
  assert.equal(resolveStatus({ status: "nope" }).ok, false);
  assert.equal(resolveStatus({ done: "yes" }).ok, false);
});

test("el historial de fechas solo crece y conserva la original", () => {
  const first = appendDateChange([], { from: new Date("2026-10-10"), to: new Date("2026-10-17"), reason: " se atrasó ", byId: "u1", at: new Date("2026-10-11T00:00:00Z") });
  assert.equal(first?.length, 1);
  assert.deepEqual(first?.[0], { from: "2026-10-10", to: "2026-10-17", reason: "se atrasó", byId: "u1", at: "2026-10-11T00:00:00.000Z" });
  const second = appendDateChange(first, { from: new Date("2026-10-17"), to: new Date("2026-10-24"), reason: "otra", byId: "u2" });
  assert.equal(second?.length, 2);
  assert.equal(second?.[0].reason, "se atrasó");
  assert.equal(lastDateChange(second)?.reason, "otra");
  // mismo día: no hay cambio que registrar
  assert.equal(appendDateChange(second, { from: new Date("2026-10-24"), to: new Date("2026-10-24T05:00:00Z"), reason: "x", byId: "u" }), null);
  // basura en la base no rompe
  assert.deepEqual(appendDateChange("no-array", { from: new Date("2026-01-01"), to: new Date("2026-01-02"), reason: "r", byId: "u" })?.length, 1);
});

test("original due date: la guardada, o la actual en acuerdos viejos", () => {
  const due = new Date("2026-11-01");
  assert.equal(dayKey(originalDueOf({ originalDueDate: null, dueDate: due })), "2026-11-01");
  assert.equal(dayKey(originalDueOf({ originalDueDate: new Date("2026-10-01"), dueDate: due })), "2026-10-01");
});

test("motivo y próximo paso", () => {
  assert.equal(validateDateChangeReason("  ").ok, false);
  assert.equal(validateDateChangeReason(undefined).ok, false);
  assert.deepEqual(validateDateChangeReason(" porque sí "), { ok: true, reason: "porque sí" });
  assert.deepEqual(validateNextStep("  "), { ok: true, nextStep: null });
  assert.equal(validateNextStep("x".repeat(301)).ok, false);
});

test("IDS compartible exige resumen propio, corto y no sensible", () => {
  assert.deepEqual(validateIssueShare({}), { ok: true, shareable: false, sharedSummary: null });
  // si no es compartible el resumen se descarta
  assert.deepEqual(validateIssueShare({ shareable: false, sharedSummary: "algo" }), { ok: true, shareable: false, sharedSummary: null });
  assert.equal(validateIssueShare({ shareable: true }).ok, false);
  assert.equal(validateIssueShare({ shareable: true, sharedSummary: "   " }).ok, false);
  assert.equal(validateIssueShare({ shareable: true, sharedSummary: "x".repeat(401) }).ok, false);
  assert.equal(validateIssueShare({ shareable: "true" }).ok, false);
  const ok = validateIssueShare({ shareable: true, sharedSummary: "  Definimos el nuevo flujo de demos  " });
  assert.deepEqual(ok, { ok: true, shareable: true, sharedSummary: "Definimos el nuevo flujo de demos" });
  const bad = validateIssueShare({ shareable: true, sharedSummary: "Revisar el salario y la salud de Ana" });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.match(bad.error, /salud/);
    assert.match(bad.error, /compensación/);
  }
});

test("acuerdo compartible: la acción pasa el filtro", () => {
  assert.deepEqual(validateCommitmentShare({ shareable: false, action: "subir el salario" }), { ok: true });
  assert.deepEqual(validateCommitmentShare({ shareable: true, action: "Publicar el nuevo flujo" }), { ok: true });
  const r = validateCommitmentShare({ shareable: true, action: "Plan de mejora para Ana" });
  assert.equal(r.ok, false);
});

test("alcance de métricas: legado intacto, selección filtra, sin selección vacío", () => {
  const metrics = [
    { id: "a", ownerId: "u1" },
    { id: "b", ownerId: "u1" },
    { id: "c", ownerId: "u2" },
  ];
  assert.equal(scopeMetrics(metrics, legacy).length, 3);
  assert.deepEqual(scopeMetrics(metrics, selection(["a", "c"])).map((m) => m.id), ["a", "c"]);
  assert.deepEqual(scopeMetrics(metrics, selection([], false)), []);
  assert.equal(isLegacyWithoutSelection(selection([], false)), true);
  assert.equal(isLegacyWithoutSelection(selection(["a"])), false);
  assert.equal(isLegacyWithoutSelection(legacy), false);
  // opciones de vínculo: solo del dueño y dentro del alcance
  assert.deepEqual(metricLinkOptions(metrics, "u1", selection(["a", "c"])).map((m) => m.id), ["a"]);
  assert.deepEqual(metricLinkOptions(metrics, "u1", legacy).map((m) => m.id), ["a", "b"]);
  assert.deepEqual(metricLinkOptions(metrics, undefined, legacy), []);
});

test("rachas: período según frecuencia, nunca semanas para mensual", () => {
  assert.equal(redStreak([{ status: "off_track" }, { status: "riesgo" }, { status: "on_track" }, { status: "off_track" }]), 2);
  assert.equal(periodsLabel("weekly", 4), "4 sem");
  assert.equal(periodsLabel("monthly", 3), "3 meses");
  assert.equal(periodsLabel("monthly", 1), "1 mes");
  assert.equal(periodsLabel("biweekly", 2), "2 quincenas");
  assert.equal(chronicThreshold("monthly", legacy), 4);
  assert.equal(chronicThreshold("monthly", selection(["a"])), 2);
  const withDef = selection(["a"], true, [{ scorecardMetricId: "a", definition: { frequency: "monthly" } }]);
  assert.equal(frequencyFor(withDef, "a", "weekly"), "monthly");
  assert.equal(frequencyFor(legacy, "a", "monthly"), "monthly");
  assert.equal(frequencyFor(legacy, "a", undefined), "weekly");
});

test("checklist manual: el período vigente depende de la frecuencia", () => {
  const cycle = { weekStart: new Date("2026-10-05T06:00:00Z"), monthStart: new Date("2026-10-01T06:00:00Z") };
  const lastWeek = new Date("2026-09-28T06:00:00Z");
  const midMonth = new Date("2026-10-02T06:00:00Z");
  assert.equal(updatedForPeriod("weekly", lastWeek, cycle), false);
  assert.equal(updatedForPeriod("biweekly", lastWeek, cycle), true);
  assert.equal(updatedForPeriod("monthly", midMonth, cycle), true);
  assert.equal(updatedForPeriod("monthly", new Date("2026-09-01T06:00:00Z"), cycle), false);
  assert.equal(updatedForPeriod("weekly", null, cycle), false);
});

test("tasas sin muestra nunca son 0.0%", () => {
  assert.deepEqual(formatRate(null), { text: "Sin muestra", detail: null, hasSample: false });
  assert.equal(formatRate(undefined).text, "Sin muestra");
  assert.equal(formatRate(Number.NaN).text, "Sin muestra");
  assert.equal(formatRate(0, { numerator: 0, denominator: 12 }).text, "0.0%");
  assert.equal(formatRate(0, { numerator: 0, denominator: 12 }).detail, "0/12");
  assert.equal(formatRate(62.5, { numerator: 5, denominator: 8 }).detail, "5/8");
  assert.equal(formatRate(null, { numerator: 0, denominator: 0 }).detail, "0/0");
});

test("NDR del desglose de MRR", () => {
  assert.equal(computeNdr(undefined, { mrrExpansion: 1, mrrContraction: 0, mrrChurn: 0 }), null);
  assert.equal(computeNdr({ mrr: 0 }, { mrrExpansion: 1, mrrContraction: 0, mrrChurn: 0 }), null);
  assert.equal(computeNdr({ mrr: 1000 }, { mrrExpansion: 100, mrrContraction: -50, mrrChurn: -50 }), 100);
  assert.equal(computeNdr({ mrr: 1000 }, { mrrExpansion: 0, mrrContraction: 50, mrrChurn: 50 }), 90);
});
