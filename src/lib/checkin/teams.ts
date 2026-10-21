// Preguntas del check-in semanal por equipo. Todos responden el mismo
// esqueleto (resultado, aprendizaje, bloqueo, compromiso) con la redacción de
// su equipo, para que el resumen y Notion tengan columnas comunes. Las
// preguntas apuntan al Rock y a los KPIs del área; los números que ya están en
// un sistema se muestran precargados y no se piden.

export type TeamKey = "ventas" | "soporte" | "revops" | "ingenieria" | "producto" | "onboarding" | "cs";

export type NumberField = {
  key: string;
  label: string;
  // Texto de ayuda corto debajo del campo.
  hint?: string;
  decimal?: boolean;
};

export type TeamConfig = {
  key: TeamKey;
  name: string;
  // Área de reporte (ReportArea.key) cuyo Rock y scorecard alimentan.
  areaKey: string;
  // Solo las métricas del área cuyo nombre empiece así (p. ej. el área
  // Customer agrupa Soporte, Onboarding y Success). Vacío = todas.
  metricPrefixes: string[];
  result: string;
  learning: string;
  // Pregunta opcional propia del equipo.
  extra: string | null;
  // Números personales que hoy no salen de ningún sistema.
  numbers: NumberField[];
};

export const ENERGY_QUESTION = "¿Cómo llegás a esta semana? Tu energía del 1 al 5";
export const ENERGY_REASON_QUESTION = "¿Por qué? (opcional)";
export const ENERGY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "1 · Muy baja" },
  { value: 2, label: "2 · Baja" },
  { value: 3, label: "3 · Normal" },
  { value: 4, label: "4 · Buena" },
  { value: 5, label: "5 · Excelente" },
];

export const BLOCKER_QUESTION = "¿Qué te está frenando y de quién necesitás ayuda?";
export const COMMITMENT_QUESTION = "¿A qué te comprometés la próxima semana?";

export const TEAMS: Record<TeamKey, TeamConfig> = {
  ventas: {
    key: "ventas",
    name: "Ventas",
    areaKey: "ventas",
    metricPrefixes: [],
    result:
      "De tus cierres y avances: ¿encajan en el perfil de cliente que retiene? ¿Qué espera resolver el cliente y qué necesita saber Onboarding para cumplirlo?",
    learning: "¿Dónde estamos perdiendo oportunidades, qué probaste para mejorar asistencia o cierre y qué aprendiste?",
    extra: null,
    numbers: [
      { key: "cierres", label: "Cierres de la semana" },
      { key: "mrr_cerrado", label: "MRR cerrado esta semana (USD)", decimal: true },
    ],
  },
  soporte: {
    key: "soporte",
    name: "Soporte",
    areaKey: "customer",
    metricPrefixes: ["Soporte"],
    result:
      "¿Qué problemas siguen impidiendo que un cliente trabaje (y a qué cuentas afectan), y cuáles verificaste con el cliente como resueltos?",
    learning: "¿Qué se está repitiendo y qué deberíamos cambiar (producto, documentación o proceso) para evitarlo?",
    extra: null,
    numbers: [
      { key: "tickets_atendidos", label: "Tickets atendidos" },
      { key: "tickets_cerrados", label: "Tickets cerrados" },
    ],
  },
  revops: {
    key: "revops",
    name: "RevOps · Growth",
    areaKey: "growth",
    metricPrefixes: [],
    result: "¿Qué cuentas tienen oportunidad de expansión o riesgo de retención, qué se les ofreció y qué pasó?",
    learning: "¿Qué aprendimos del experimento del mes y qué parte del proceso ya podemos repetir con evidencia?",
    extra: "¿Qué probamos en marketing, qué aprendimos y qué conviene repetir o dejar de hacer?",
    numbers: [{ key: "leads_a_ventas", label: "Leads que Marketing envió a Ventas" }],
  },
  ingenieria: {
    key: "ingenieria",
    name: "Ingeniería",
    areaKey: "ingenieria",
    metricPrefixes: [],
    result: "¿Qué puede hacer ahora el cliente que antes no podía?",
    learning:
      "¿Qué problema técnico está afectando más el uso o la confiabilidad, a qué cuentas, y qué falta para resolverlo?",
    extra: "¿Qué automatizamos (para el cliente o internamente) o resolvió el agente de bugs?",
    numbers: [{ key: "resueltos", label: "Bugs, mejoras y features resueltos" }],
  },
  producto: {
    key: "producto",
    name: "Producto",
    areaKey: "producto",
    metricPrefixes: [],
    result: "¿Qué decisión tomamos sobre un feature o mejora, y con qué evidencia?",
    learning:
      "¿Qué aprendimos sobre cómo el cliente obtiene valor en campo o en oficina, o sobre dónde se traba en el flujo inicial sin ayuda?",
    extra: "¿Qué probamos o qué avanzó en una prueba anterior? ¿Qué aprendimos?",
    numbers: [],
  },
  onboarding: {
    key: "onboarding",
    name: "Onboarding",
    areaKey: "customer",
    metricPrefixes: ["Onboarding"],
    result:
      "¿Qué cuentas llegaron a su primer valor (presupuesto con gastos asignados y primer reporte al ejecutivo) y cuáles ya lo repiten sin nuestra ayuda?",
    learning: "¿Qué las está frenando y qué prueba nos ayudó a reducir esa dificultad?",
    extra: "¿Qué aprendiste que puede darle más valor a un cliente o convertirse en una mejora de producto?",
    numbers: [{ key: "sesiones", label: "Sesiones de onboarding" }],
  },
  cs: {
    key: "cs",
    name: "Customer Success",
    areaKey: "customer",
    metricPrefixes: ["Success"],
    result:
      "¿Qué cuentas muestran una mejora o un deterioro real en su uso, con qué evidencia (además de si nos contestan) y qué hicimos o haremos?",
    learning: "¿Qué aprendimos de quienes se quedan y de quienes se van? ¿Qué acción concreta sale de eso?",
    extra: "¿Qué probamos o qué avanzó en una prueba anterior? ¿Qué aprendimos?",
    numbers: [{ key: "mrr_recuperado", label: "MRR en riesgo recuperado (USD)", decimal: true }],
  },
};

export function teamConfig(key: string | null | undefined): TeamConfig | null {
  if (!key) return null;
  return (TEAMS as Record<string, TeamConfig>)[key] ?? null;
}

export function isTeamKey(key: string): key is TeamKey {
  return key in TEAMS;
}

// En Customer cada equipo ve solo su subárea (Onboarding, Success, Soporte).
export function metricMatchesTeam(team: TeamConfig, group: string | null): boolean {
  if (team.metricPrefixes.length === 0) return true;
  const g = (group ?? "").toLowerCase();
  return team.metricPrefixes.some((p) => g === p.toLowerCase());
}

export const PREVIOUS_STATUS_LABEL: Record<string, string> = {
  done: "Cumplido",
  partial: "Parcial",
  not_done: "No se cumplió",
};
