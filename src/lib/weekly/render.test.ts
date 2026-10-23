import test from "node:test";
import assert from "node:assert/strict";
import { draftToParts, parseNarrative, renderWeeklyDraft, summarizeEnergy, THREAD_MARKER, type WeekData } from "./render";

const base: WeekData = {
  periodStart: new Date("2026-10-12T06:00:00Z"),
  companyMetrics: [{ label: "MRR", valueText: "$48.2K", targetText: "$50K", signal: "riesgo" }],
  areas: [
    { key: "ventas", name: "Ventas", leaderName: "Lorena", rock: { title: "Cerrar clientes que retienen", status: "on_track" }, advance: "Rúbrica BANT propuesta", nextStep: "Aplicarla en todas las demos" },
    { key: "producto", name: "Producto", leaderName: "Glory", rock: null, advance: null, nextStep: null },
  ],
  answers: [
    {
      id: "a1", name: "María Paula", teamName: "Ventas", areaKey: "ventas",
      result: "FG Asesores y Sampson cerraron en ≤8 días", learning: "Discovery riguroso acorta el ciclo", extra: null, extraQuestion: null,
      blocker: "Necesito el módulo de avance de obra para constructoras", commitment: "4 cierres", previousCommitment: "3 cierres", previousStatus: "partial",
      numbers: [{ label: "Cierres", value: 2 }], highlighted: true,
    },
  ],
  responded: 1,
  expected: 3,
  energy: null,
  management: { meetingDate: "2026-10-16T15:30:00Z", agreements: [{ id: "c1", action: "Publicar rúbrica", ownerName: "Lorena", dueDate: "2026-10-23", status: "open" }], decisions: [] },
  detailUrl: "https://eos.test/semana?w=2026-10-12",
};

test("el borrador tiene todas las secciones y los compromisos van al hilo", () => {
  const draft = renderWeeklyDraft(base, null);
  for (const h of ["Semana del 12 al 18 de octubre", "Prioridades del trimestre", "Qué avanzó por área", "Lo que aprendimos", "Dónde necesitamos ayuda", "Acuerdos de management"]) {
    assert.ok(draft.includes(h), h);
  }
  assert.match(draft, /🟡 MRR \*\$48\.2K\* \(meta \$50K\)/);
  assert.match(draft, /⚪ \*Producto\* · Rock por definir/);
  assert.match(draft, /Respondieron 1 de 3 personas/);
  const [main, thread] = draft.split(THREAD_MARKER);
  assert.doesNotMatch(main, /Compromisos para la próxima semana/);
  assert.match(thread, /María Paula: 4 cierres _\(semana pasada: 🟡 Parcial\)_/);
});

test("sin reunión no aparece la sección de management", () => {
  assert.doesNotMatch(renderWeeklyDraft({ ...base, management: null }, null), /Acuerdos de management/);
});

test("la redacción de Claude reemplaza la lista por área, sin tocar números ni bloqueos", () => {
  const narrative = parseNarrative({ areas: [{ areaKey: "ventas", texto: "Dos cierres en ciclos cortos (María Paula)." }, { areaKey: "inventada", texto: "x" }], aprendizajes: ["El discovery acorta el ciclo (María Paula)"] }, base);
  assert.ok(narrative);
  assert.equal(narrative!.areas.length, 1, "área desconocida descartada");
  const draft = renderWeeklyDraft(base, narrative);
  assert.match(draft, /\*Ventas\* — Dos cierres en ciclos cortos \(María Paula\)\./);
  assert.match(draft, /• \*María Paula\* \(Ventas\): Necesito el módulo/);
});

test("respuesta inválida de Claude → versión determinística", () => {
  assert.equal(parseNarrative("texto", base), null);
  assert.equal(parseNarrative({ areas: "x" }, base), null);
});

test("menciones masivas en respuestas se neutralizan", () => {
  const draft = renderWeeklyDraft({ ...base, answers: [{ ...base.answers[0], result: "Listo <!channel> <@U123>" }] }, null);
  assert.doesNotMatch(draft, /<!channel>|<@U123>/);
});

test("el borrador editado se parte en mensaje principal e hilo", () => {
  const parts = draftToParts(`*Hola*\n\nlinea\n\n${THREAD_MARKER}\n\n*Compromisos*\n• a`);
  assert.deepEqual(parts, ["*Hola*\n\nlinea", "*Compromisos*\n• a"]);
  assert.equal(draftToParts("solo principal").length, 1);
});

test("la energía se muestra solo agregada y con muestra suficiente", () => {
  assert.deepEqual(summarizeEnergy([4, 2, 5, null, 1]), { average: 3, count: 4, low: 2 });
  assert.equal(summarizeEnergy([null, undefined]), null);
  assert.match(renderWeeklyDraft({ ...base, energy: { average: 3.8, count: 5, low: 1 } }, null), /Energía del equipo: 3,8\/5\./);
  assert.doesNotMatch(renderWeeklyDraft({ ...base, energy: { average: 4, count: 2, low: 0 } }, null), /Energía/, "con menos de 3 respuestas no se muestra");
});

test("el pie muestra la participación por área sin nombres", () => {
  const draft = renderWeeklyDraft({ ...base, areaParticipation: [{ name: "Ventas", responded: 1, expected: 1 }, { name: "Producto", responded: 0, expected: 2 }, { name: "Vacía", responded: 0, expected: 0 }] }, null);
  assert.match(draft, /Respondieron 1 de 3 personas \(Ventas 1\/1 · Producto 0\/2\)\./);
  assert.doesNotMatch(draft, /Vacía/);
});

test("lo que escuchamos solo muestra el resumen compartible del IDS", () => {
  const draft = renderWeeklyDraft({ ...base, heard: [
    { title: "Importación desde Excel", resolved: false, sharedSummary: "Ingeniería pagina el importador esta semana." },
    { title: "Avance de obra", resolved: true, sharedSummary: null },
  ] }, null);
  assert.match(draft, /Lo que escuchamos del equipo/);
  assert.match(draft, /Importación desde Excel: lo llevamos a la reunión de management\. Ingeniería pagina/);
  assert.match(draft, /Avance de obra: lo llevamos a la reunión de management\. Quedó resuelto\./);
  assert.doesNotMatch(renderWeeklyDraft(base, null), /Lo que escuchamos/);
});
