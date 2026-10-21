import test from "node:test";
import assert from "node:assert/strict";
import { homePathFor, isAllowedEmail, isLeaderOnlyPath, isLeaderRole } from "./access";

test("el equipo no abre páginas ni APIs de managers", () => {
  for (const p of ["/dashboard", "/l10", "/l10/x", "/api/l10/issues", "/api/weekly/summary", "/api/rocks", "/api/rocks/abc", "/api/scorecard", "/api/sync/hubspot"]) {
    assert.equal(isLeaderOnlyPath(p), true, p);
  }
  for (const p of ["/empresa", "/rocks", "/scorecard", "/semana", "/plan/abc", "/accountability-chart", "/quarterly", "/api/rockstar"]) {
    assert.equal(isLeaderOnlyPath(p), false, p);
  }
});

test("roles y dominio de Google", () => {
  assert.equal(isLeaderRole("ceo"), true);
  assert.equal(isLeaderRole("team"), false);
  assert.equal(isLeaderRole(undefined), false);
  assert.equal(isAllowedEmail("ana@mawi.io"), true);
  assert.equal(isAllowedEmail("Ana@MAWI.io"), true);
  assert.equal(isAllowedEmail("ana@gmail.com"), false);
  assert.equal(isAllowedEmail("ana@mawi.io.evil.com"), false);
  assert.equal(homePathFor("ceo"), "/dashboard");
  assert.equal(homePathFor("team"), "/empresa");
  assert.equal(homePathFor("sales"), "/empresa");
});
