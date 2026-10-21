// Separa la subárea del nombre de un KPI. Acepta la subárea explícita de la
// definición o el formato heredado "Subárea: nombre" (p. ej. "Onboarding: Days
// to Activate"), para que el nombre se muestre limpio y la subárea aparte.

const KNOWN_GROUPS = ["Onboarding", "Success", "Soporte"];

export function splitMetricLabel(label: string, group?: string | null): { title: string; group: string | null } {
  const explicit = group?.trim() || null;
  const m = /^\s*([^:]{2,30}):\s+(.+)$/.exec(label);
  if (m && (explicit ? m[1].trim().toLowerCase() === explicit.toLowerCase() : KNOWN_GROUPS.some((g) => g.toLowerCase() === m[1].trim().toLowerCase()))) {
    return { title: m[2].trim(), group: explicit ?? m[1].trim() };
  }
  return { title: label, group: explicit };
}
