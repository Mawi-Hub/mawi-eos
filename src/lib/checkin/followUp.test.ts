import test from "node:test";
import assert from "node:assert/strict";
import { channelReminderText, managerFollowUpText } from "./followUp";
import { TEAMS } from "./teams";

test("el aviso del canal da el conteo y nunca nombres", () => {
  const text = channelReminderText(3, 16);
  assert.match(text, /Faltan 3 check-ins de 16/);
  assert.match(text, /13:00/);
  assert.match(channelReminderText(1, 16), /Falta 1 check-in de 16/);
});

test("el DM al manager lista a su gente y neutraliza menciones", () => {
  const m = (name: string) => ({ id: name, displayName: name, slackUserId: "U" + name, userId: null, areaKey: "ventas", team: TEAMS.ventas });
  const text = managerFollowUpText("Lorena Pérez", [m("Ana"), m("<!channel>")], "19 al 25 de octubre");
  assert.match(text, /Lorena, 2 personas de tu área/);
  assert.match(text, /• Ana \(Ventas\)/);
  assert.doesNotMatch(text, /<!channel>/);
});
