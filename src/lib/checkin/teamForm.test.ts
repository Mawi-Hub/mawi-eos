import test from "node:test";
import assert from "node:assert/strict";
import { buildModal, inviteBlocks, parseMetadata, parseSubmission, submissionText, weekLabel } from "./teamForm";
import { TEAMS } from "./teams";

const monday = new Date("2026-10-19T06:00:00Z"); // lunes 19 oct 00:00 CR

const v = (value: string) => ({ v: { value } });

test("cada equipo tiene resultado y aprendizaje y apunta a un área", () => {
  for (const t of Object.values(TEAMS)) {
    assert.ok(t.result.length > 10 && t.learning.length > 10, t.key);
    assert.ok(t.areaKey, t.key);
  }
});

test("la semana se muestra lunes a domingo", () => {
  assert.equal(weekLabel(monday), "19 al 25 de octubre");
  assert.equal(weekLabel(new Date("2026-10-26T06:00:00Z")), "26 de octubre al 1 de noviembre");
});

test("el modal lleva las preguntas del equipo, los números y el compromiso anterior", () => {
  const view = buildModal({
    team: TEAMS.ventas,
    periodStart: monday,
    firstName: "María",
    systemNumbers: [{ label: "Show rate", valueText: "77%", targetText: "65%", periodLabel: "octubre" }],
    previousCommitment: "4 cierres",
    existing: null,
    memberId: "m1",
  }) as { blocks: Array<{ block_id?: string; label?: { text: string }; elements?: Array<{ text: string }> }>; private_metadata: string };
  const ids = view.blocks.map((b) => b.block_id).filter(Boolean);
  assert.deepEqual(ids, ["prev", "result", "learning", "num_cierres", "num_mrr_cerrado", "blocker", "commitment"]);
  assert.equal(view.blocks.find((b) => b.block_id === "result")?.label?.text, TEAMS.ventas.result);
  assert.match(JSON.stringify(view.blocks), /Show rate: \*77%\* · meta 65%/);
  assert.deepEqual(parseMetadata(view.private_metadata), { p: "2026-10-19", m: "m1" });
});

test("sin compromiso anterior no se pregunta cómo terminó", () => {
  const view = buildModal({ team: TEAMS.producto, periodStart: monday, firstName: "G", systemNumbers: [], previousCommitment: null, existing: null, memberId: "m" }) as { blocks: Array<{ block_id?: string }> };
  assert.ok(!view.blocks.some((b) => b.block_id === "prev"));
  assert.ok(view.blocks.some((b) => b.block_id === "extra"));
});

test("faltan campos obligatorios → errores por bloque, nada se guarda", () => {
  const r = parseSubmission(TEAMS.ventas, { result: v(""), learning: v("aprendí"), commitment: v(" "), num_cierres: v("-2") }, true);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(Object.keys(r.errors).sort(), ["commitment", "num_cierres", "prev", "result"]);
});

test("una respuesta completa se normaliza", () => {
  const r = parseSubmission(
    TEAMS.ventas,
    {
      prev: { v: { selected_option: { value: "partial" } } },
      result: v("  2 cierres con perfil que retiene (FG, Sampson)  "),
      learning: v("Discovery riguroso acorta el ciclo"),
      num_cierres: v("2"),
      num_mrr_cerrado: v("650.5"),
      blocker: v(""),
      commitment: v("4 cierres: ATS, Luis Germán, IACOSA, EME"),
    },
    true,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.submission.result, "2 cierres con perfil que retiene (FG, Sampson)");
  assert.equal(r.submission.blocker, null);
  assert.equal(r.submission.previousCommitmentStatus, "partial");
  assert.deepEqual(r.submission.numbers.map((n) => n.value), [2, 650.5]);
  assert.match(submissionText(TEAMS.ventas, r.submission, "3 cierres"), /Compromiso anterior \(Parcial\): 3 cierres/);
});

test("metadata manipulada se rechaza", () => {
  assert.equal(parseMetadata("{\"p\":\"ayer\",\"m\":\"x\"}"), null);
  assert.equal(parseMetadata("no json"), null);
});

test("la invitación respondida ofrece editar y neutraliza menciones", () => {
  const msg = inviteBlocks({ firstName: "<!channel>", teamName: "Ventas", periodStart: monday, reminder: false, answered: true });
  const text = JSON.stringify(msg.blocks);
  assert.match(text, /Editar mi respuesta/);
  assert.doesNotMatch(text, /<!channel>/);
});
