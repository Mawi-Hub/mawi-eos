import test from "node:test";
import assert from "node:assert/strict";
import { parseThemeRef, parseThemes, themeMeta, themeRef, themesPrompt, themesSlackText, type ThemeAnswer } from "./themes";

const answers: ThemeAnswer[] = [
  { ref: "a1", areaName: "Customer", teamName: "Onboarding", text: "Bloqueo / ayuda: la importación desde Excel falla" },
  { ref: "a2", areaName: "Customer", teamName: "Soporte", text: "Aprendizaje: 4 tickets por importar presupuestos" },
  { ref: "a3", areaName: "Ventas", teamName: "Ventas", text: "Bloqueo / ayuda: necesito que Producto defina avance de obra" },
  { ref: "a4", areaName: "Ingeniería", teamName: "Ingeniería", text: "Aprendizaje: los timeouts del importador" },
];
const previous = [{ id: "sincronizacion-de-gastos", title: "Sincronización de gastos", firstSeen: "2026-10-05", weeks: 2, week: "2026-10-12" }];

test("el conteo y las áreas salen de las respuestas citadas, no del modelo", () => {
  const themes = parseThemes(
    { temas: [{ titulo: "Importación de presupuestos desde Excel", detalle: "Frena onboarding y genera tickets", tipo: "repetido", refs: ["a1", "a2", "a4", "a1", "zz"], citas: ["la importación desde Excel falla"] }] },
    { answers, previous, week: "2026-10-19" },
  );
  assert.equal(themes.length, 1);
  assert.equal(themes[0].people, 3);
  assert.deepEqual(themes[0].areas, ["Customer", "Ingeniería"]);
  assert.equal(themes[0].kind, "repetido");
  assert.equal(themes[0].id, "importacion-de-presupuestos-desde-excel");
});

test("una sola mención no entra salvo dependencia entre áreas o tema que continúa", () => {
  const themes = parseThemes(
    {
      temas: [
        { titulo: "Algo que dijo una sola persona", tipo: "repetido", refs: ["a4"] },
        { titulo: "Ventas depende de Producto para avance de obra", tipo: "dependencia", refs: ["a3"] },
        { titulo: "Sincronización de gastos sigue fallando", tipo: "recurrente", refs: ["a2"], continua: "sincronizacion-de-gastos" },
        { titulo: "Continúa un id inventado", tipo: "recurrente", refs: ["a4"], continua: "no-existe" },
      ],
    },
    { answers, previous, week: "2026-10-19" },
  );
  assert.deepEqual(themes.map((t) => t.kind), ["dependencia", "recurrente"]);
  const rec = themes[1];
  assert.equal(rec.id, "sincronizacion-de-gastos");
  assert.equal(rec.firstSeen, "2026-10-05");
  assert.equal(rec.weeks, 3);
  assert.match(themeMeta(rec), /1 persona · Customer · viene de semanas anteriores · 3\.ª semana/);
});

test("respuestas inválidas del modelo no rompen", () => {
  assert.deepEqual(parseThemes(null, { answers, previous, week: "2026-10-19" }), []);
  assert.deepEqual(parseThemes({ temas: "x" }, { answers, previous, week: "2026-10-19" }), []);
});

test("la referencia de un tema se arma y valida", () => {
  const ref = themeRef(new Date("2026-10-19T06:00:00Z"), "importacion-excel");
  assert.equal(ref, "2026-10-19:importacion-excel");
  assert.deepEqual(parseThemeRef(ref), { week: "2026-10-19", themeId: "importacion-excel" });
  assert.equal(parseThemeRef("2026-10-19:<script>"), null);
});

test("el prompt no lleva nombres y el aviso de Slack neutraliza menciones", () => {
  assert.doesNotMatch(themesPrompt(answers, previous), /María|Lorena/);
  const text = themesSlackText([{ id: "x", title: "<!channel> problema", detail: "", kind: "repetido", people: 2, areas: ["Ventas"], firstSeen: "2026-10-19", weeks: 1, quotes: [] }], "https://eos.test/l10");
  assert.doesNotMatch(text, /<!channel>/);
  assert.match(text, /Llevar a IDS: https:\/\/eos\.test\/l10/);
});
