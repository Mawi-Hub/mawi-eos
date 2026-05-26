import Link from "next/link";
import {
  formatKPIValueFull,
  getKPIStatus,
  findEntryForCurrentMonth,
  lastRealEntry,
  type KPIDirection,
} from "@/lib/plan/calculations";
import { PlanSemaforo } from "./PlanSemaforo";
import { PlanKPIChart } from "./PlanKPIChart";

type Entry = { period: Date | string; projected: number; actual: number | null };

export function PlanKPICard({
  planId,
  kpiId,
  name,
  unit,
  direction,
  target,
  ownerName,
  entries,
}: {
  planId: string;
  kpiId: string;
  name: string;
  unit: string;
  direction: KPIDirection;
  target: number;
  ownerName: string;
  entries: Entry[];
}) {
  const normalized = entries.map((e) => ({
    period: new Date(e.period),
    projected: e.projected,
    actual: e.actual,
  }));

  const currentMonth = findEntryForCurrentMonth(normalized);
  const lastReal = lastRealEntry(normalized);
  const status = currentMonth
    ? getKPIStatus(currentMonth.actual, currentMonth.projected, direction)
    : "pending";

  return (
    <Link
      href={`/plan/${planId}/kpis/${kpiId}`}
      className="block rounded-xl border border-gray-200 bg-white p-5 transition hover:border-mawi-300 hover:shadow-sm"
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{name}</h3>
          <p className="text-xs text-gray-500">{ownerName}</p>
        </div>
        <PlanSemaforo status={status} />
      </div>

      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {formatKPIValueFull(lastReal?.actual ?? null, unit)}
        </span>
        <span className="text-xs text-gray-400">/ {formatKPIValueFull(target, unit)}</span>
      </div>

      <PlanKPIChart
        entries={normalized}
        target={target}
        unit={unit}
        direction={direction}
        height={140}
      />
    </Link>
  );
}
