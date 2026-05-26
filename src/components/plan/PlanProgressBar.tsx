import { formatKPIValueFull, getProgressPct, type KPIDirection } from "@/lib/plan/calculations";

export function PlanProgressBar({
  current,
  baseline,
  target,
  direction,
  unit,
}: {
  current: number | null;
  baseline: number;
  target: number;
  direction: KPIDirection;
  unit: string;
}) {
  const pct = getProgressPct(current, baseline, target, direction);
  const color =
    pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
        <span>Base: {formatKPIValueFull(baseline, unit)}</span>
        <span>{pct.toFixed(0)}%</span>
        <span>Meta: {formatKPIValueFull(target, unit)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
