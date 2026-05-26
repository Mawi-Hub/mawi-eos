import {
  formatKPIValueFull,
  getKPIStatus,
  getDynamicProjection,
  findEntryForCurrentMonth,
  lastRealEntry,
  type KPIDirection,
} from "@/lib/plan/calculations";
import { PlanSemaforo } from "./PlanSemaforo";
import { PlanProgressBar } from "./PlanProgressBar";

type Entry = { period: Date | string; projected: number; actual: number | null };

type KPI = {
  id: string;
  slug: string;
  name: string;
  unit: string;
  direction: KPIDirection;
  baseline: number;
  target: number;
  owner: { name: string };
  entries: Entry[];
};

const NORTH_STAR_SLUGS = ["mrr", "ndr", "ccr"];

export function PlanNorthStars({ kpis }: { kpis: KPI[] }) {
  const northStars = NORTH_STAR_SLUGS.map((slug) => kpis.find((k) => k.slug === slug)).filter(
    (k): k is KPI => k !== undefined
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {northStars.map((kpi) => {
        const normalized = kpi.entries.map((e) => ({
          period: new Date(e.period),
          projected: e.projected,
          actual: e.actual,
        }));
        const current = findEntryForCurrentMonth(normalized);
        const lastReal = lastRealEntry(normalized);
        const status = current
          ? getKPIStatus(current.actual, current.projected, kpi.direction)
          : "pending";
        const dynamic = getDynamicProjection(normalized, kpi.target, kpi.direction);
        const currentValue = lastReal?.actual ?? null;

        return (
          <div
            key={kpi.id}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {kpi.name}
                </div>
                <div className="text-xs text-gray-400">{kpi.owner.name}</div>
              </div>
              <PlanSemaforo status={status} />
            </div>

            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">
                {formatKPIValueFull(currentValue, kpi.unit)}
              </span>
              <span className="text-sm text-gray-400">
                / {formatKPIValueFull(kpi.target, kpi.unit)}
              </span>
            </div>

            <PlanProgressBar
              current={currentValue}
              baseline={kpi.baseline}
              target={kpi.target}
              direction={kpi.direction}
              unit={kpi.unit}
            />

            {lastReal && (
              <div className="mt-3 text-xs text-gray-500">
                A este ritmo:{" "}
                <span
                  className={
                    dynamic.onTrackForStretch ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"
                  }
                >
                  {formatKPIValueFull(dynamic.projectedFinal, kpi.unit)}
                </span>{" "}
                en diciembre
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
