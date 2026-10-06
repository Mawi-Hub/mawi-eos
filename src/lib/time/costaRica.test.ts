import test from "node:test";
import assert from "node:assert/strict";
import { checkinPeriodStart, crIsoDate, crMonthEnd, crMonthStart, crParts, crWeekEnd, crWeekStart, reportPeriodFor } from "./costaRica";

// 00:00 CR = 06:00 UTC.
const iso = (d: Date) => d.toISOString();

test("la semana va de lunes a domingo en hora de Costa Rica", () => {
  // Viernes 2026-10-09 10:00 CR = 16:00 UTC
  const friday = new Date("2026-10-09T16:00:00Z");
  assert.equal(iso(crWeekStart(friday)), "2026-10-05T06:00:00.000Z");
  assert.equal(iso(crWeekEnd(friday)), "2026-10-12T05:59:59.999Z");
});

test("un domingo de noche en CR (ya lunes en UTC) sigue en la semana anterior", () => {
  // Domingo 2026-10-11 20:00 CR = lunes 02:00 UTC
  const d = new Date("2026-10-12T02:00:00Z");
  assert.equal(crParts(d).weekday, 6);
  assert.equal(iso(crWeekStart(d)), "2026-10-05T06:00:00.000Z");
});

test("cambio de mes y de año", () => {
  const d = new Date("2026-12-31T20:00:00Z"); // jueves 14:00 CR
  assert.equal(iso(crWeekStart(d)), "2026-12-28T06:00:00.000Z");
  assert.equal(iso(crWeekEnd(d)), "2027-01-04T05:59:59.999Z");
  assert.equal(iso(crMonthEnd(d)), "2027-01-01T05:59:59.999Z");
  assert.equal(iso(crMonthStart(new Date("2027-01-01T05:00:00Z"))), "2026-12-01T06:00:00.000Z"); // aún 31 dic en CR
});

test("el 1 de octubre a las 00:30 CR ya es octubre", () => {
  const d = new Date("2026-10-01T06:30:00Z");
  assert.equal(crIsoDate(d), "2026-10-01");
  assert.equal(iso(crMonthStart(d)), "2026-10-01T06:00:00.000Z");
});

test("el período de una reunión de viernes es esa semana", () => {
  const p = reportPeriodFor(new Date("2026-10-09T15:30:00Z"));
  assert.equal(iso(p.start), "2026-10-05T06:00:00.000Z");
  assert.equal(iso(p.end), "2026-10-12T05:59:59.999Z");
});

test("respuestas tardías del check-in siguen en la semana del jueves original", () => {
  const thursdayWeek = "2026-10-05T06:00:00.000Z";
  // jueves, viernes, sábado y lunes siguiente (hora CR)
  for (const at of ["2026-10-08T16:00:00Z", "2026-10-09T18:00:00Z", "2026-10-10T18:00:00Z", "2026-10-12T16:00:00Z"]) {
    assert.equal(iso(checkinPeriodStart(new Date(at))), thursdayWeek, at);
  }
  // el jueves de la semana siguiente abre un período nuevo
  assert.equal(iso(checkinPeriodStart(new Date("2026-10-15T16:00:00Z"))), "2026-10-12T06:00:00.000Z");
});
