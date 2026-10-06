// Puente entre el enum legado PlanArea y las áreas de reporte. COMERCIAL cubre
// a la vez Ventas y Growth, así que no se adivina: se separa solo con una señal
// clara (responsable o título) y, si es ambiguo, queda en un grupo propio.

export type ReportAreaKey = "ventas" | "growth" | "customer" | "producto" | "ingenieria";
export type DisplayAreaKey = ReportAreaKey | "comercial_sin_separar" | "general";

export const COMERCIAL_UNSPLIT_LABEL = "Comercial (sin separar)";
export const GENERAL_LABEL = "General (North Star)";

const GROWTH_PATTERNS = [
  /\bgrowth\b/, /\bmarketing\b/, /\bleads?\b/, /\bmql\b/, /\btrafico\b/, /\bseo\b/, /\bads\b/,
  /\bcampan(a|as)\b/, /\bcontenido\b/, /\binbound\b/, /\bdemanda\b/, /\bwebinars?\b/, /\bcpl\b/,
  /\bnewsletter\b/, /\bredes sociales\b/,
];
const VENTAS_PATTERNS = [
  /\bventas?\b/, /\bdeals?\b/, /\bpipeline\b/, /\bcierres?\b/, /\bcerrar\b/, /\bdemos?\b/, /\bsdr\b/, /\bbdr\b/,
  /\boutbound\b/, /\bprospeccion\b/, /\bcuota\b/, /\bforecast\b/, /\bclientes nuevos\b/, /\bpropuestas? comerciales?\b/,
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type ClassifyContext = {
  ventasUserIds: Set<string>;
  growthUserIds: Set<string>;
};

export function classifyComercial(item: { title: string; ownerId?: string | null }, ctx: ClassifyContext): DisplayAreaKey {
  const inVentas = !!item.ownerId && ctx.ventasUserIds.has(item.ownerId);
  const inGrowth = !!item.ownerId && ctx.growthUserIds.has(item.ownerId);
  if (inVentas && !inGrowth) return "ventas";
  if (inGrowth && !inVentas) return "growth";

  const text = normalize(item.title);
  const ventasHit = VENTAS_PATTERNS.some((p) => p.test(text));
  const growthHit = GROWTH_PATTERNS.some((p) => p.test(text));
  if (ventasHit && !growthHit) return "ventas";
  if (growthHit && !ventasHit) return "growth";
  return "comercial_sin_separar";
}

// Nunca descarta: NORTH_STAR va a "general".
export function displayAreaForLegacy(
  area: string,
  item: { title: string; ownerId?: string | null },
  ctx: ClassifyContext,
): DisplayAreaKey {
  switch (area) {
    case "COMERCIAL":
      return classifyComercial(item, ctx);
    case "CUSTOMER_SUCCESS":
      return "customer";
    case "PRODUCTO":
      return "producto";
    case "INGENIERIA":
      return "ingenieria";
    default:
      return "general";
  }
}

export function groupByDisplayArea<T extends { area: string; title: string; ownerId?: string | null }>(
  items: T[],
  ctx: ClassifyContext,
  knownKeys: Set<string>,
): Map<DisplayAreaKey, T[]> {
  const out = new Map<DisplayAreaKey, T[]>();
  for (const item of items) {
    let key = displayAreaForLegacy(item.area, item, ctx);
    // Un área de reporte que no existe (o está inactiva) no hace desaparecer el ítem.
    if (key !== "comercial_sin_separar" && key !== "general" && !knownKeys.has(key)) key = "general";
    const list = out.get(key) ?? [];
    list.push(item);
    out.set(key, list);
  }
  return out;
}
