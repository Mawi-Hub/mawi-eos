// Elección del trimestre a mostrar a partir de `?q=`. Solo se aceptan
// trimestres de la lista dada (los del plan); cualquier otro valor cae al
// trimestre por defecto en vez de abrir datos ajenos.

export type PickableQuarter = { id: string; year: number; quarter: number; isActive: boolean; startDate: Date };

export function sortQuarters<T extends PickableQuarter>(quarters: T[]): T[] {
  return [...quarters].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

export function resolveQuarter<T extends PickableQuarter>(quarters: T[], requested: string | string[] | undefined | null): T | null {
  if (quarters.length === 0) return null;
  const q = Array.isArray(requested) ? requested[0] : requested;
  if (q) {
    const found = quarters.find((x) => x.id === q);
    if (found) return found;
  }
  const active = quarters.find((x) => x.isActive);
  if (active) return active;
  const sorted = sortQuarters(quarters);
  return sorted[sorted.length - 1];
}

export function quarterLabel(q: { year: number; quarter: number }): string {
  return `Q${q.quarter} ${q.year}`;
}
