export type KPIStatus = "on_track" | "riesgo" | "off_track" | "pending";
export type KPIDirection = "ABOVE" | "BELOW";

export function getKPIStatus(
  actual: number | null | undefined,
  projected: number,
  direction: KPIDirection
): KPIStatus {
  if (actual === null || actual === undefined) return "pending";

  const ratio = direction === "ABOVE" ? actual / projected : projected / actual;

  if (ratio >= 1.0) return "on_track";
  if (ratio >= 0.9) return "riesgo";
  return "off_track";
}

export type Entry = { period: Date; projected: number; actual: number | null };

export function getDynamicProjection(
  entries: Entry[],
  target: number,
  direction: KPIDirection
): { projectedFinal: number; onTrackForStretch: boolean } {
  const realEntries = entries.filter((e) => e.actual !== null);

  if (realEntries.length < 2) {
    return { projectedFinal: target, onTrackForStretch: false };
  }

  const last = realEntries[realEntries.length - 1].actual!;
  const prev = realEntries[realEntries.length - 2].actual!;
  const monthlyChange = last - prev;

  const remainingMonths = entries.length - realEntries.length;
  const projectedFinal = last + monthlyChange * remainingMonths;

  const onTrackForStretch =
    direction === "ABOVE" ? projectedFinal >= target : projectedFinal <= target;

  return { projectedFinal, onTrackForStretch };
}

export function getProgressPct(
  current: number | null,
  baseline: number,
  target: number,
  direction: KPIDirection
): number {
  if (current === null) return 0;

  if (direction === "ABOVE") {
    if (target === baseline) return current >= target ? 100 : 0;
    return Math.min(100, Math.max(0, ((current - baseline) / (target - baseline)) * 100));
  }

  if (baseline === target) return current <= target ? 100 : 0;
  return Math.min(100, Math.max(0, ((baseline - current) / (baseline - target)) * 100));
}

export function formatKPIValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (unit === "USD") {
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toLocaleString("en-US", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      })}K`;
    }
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (unit === "PCT") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toLocaleString("en-US");
}

export function formatKPIValueFull(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (unit === "USD") {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (unit === "PCT") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toLocaleString("en-US");
}

export function currentMonthPeriod(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function findEntryForCurrentMonth(entries: Entry[], now = new Date()): Entry | undefined {
  const target = currentMonthPeriod(now).getTime();
  return entries.find((e) => new Date(e.period).getTime() === target);
}

export function lastRealEntry(entries: Entry[]): Entry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].actual !== null) return entries[i];
  }
  return undefined;
}
