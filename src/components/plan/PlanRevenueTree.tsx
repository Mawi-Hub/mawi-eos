import {
  formatKPIValueFull,
  getKPIStatus,
  lastRealEntry,
  type KPIDirection,
} from "@/lib/plan/calculations";
import { PlanSemaforo } from "./PlanSemaforo";

type Entry = { period: Date | string; projected: number; actual: number | null };

type KPI = {
  slug: string;
  name: string;
  unit: string;
  direction: KPIDirection;
  target: number;
  entries: Entry[];
};

function bySlug(kpis: KPI[], slug: string) {
  return kpis.find((k) => k.slug === slug);
}

function Node({
  label,
  target,
  current,
  unit,
  direction,
  projected,
  sublabel,
}: {
  label: string;
  target: number;
  current: number | null;
  unit: string;
  direction: KPIDirection;
  projected: number | null;
  sublabel?: string;
}) {
  const status =
    projected !== null ? getKPIStatus(current, projected, direction) : "pending";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-gray-700">{label}</div>
          {sublabel && <div className="text-[10px] text-gray-400">{sublabel}</div>}
        </div>
        <PlanSemaforo status={status} />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-base font-semibold text-gray-900">
          {formatKPIValueFull(current, unit)}
        </span>
        <span className="text-[11px] text-gray-400">/ {formatKPIValueFull(target, unit)}</span>
      </div>
    </div>
  );
}

export function PlanRevenueTree({ kpis }: { kpis: KPI[] }) {
  const mrr = bySlug(kpis, "mrr");
  const ndr = bySlug(kpis, "ndr");
  const ccr = bySlug(kpis, "ccr");
  const newBiz = bySlug(kpis, "new_biz_mrr");
  const exp = bySlug(kpis, "expansion_mrr");

  function lastFor(kpi: KPI | undefined) {
    if (!kpi) return { current: null as number | null, projected: null as number | null };
    const normalized = kpi.entries.map((e) => ({
      period: new Date(e.period),
      projected: e.projected,
      actual: e.actual,
    }));
    const last = lastRealEntry(normalized);
    return {
      current: last?.actual ?? null,
      projected: last?.projected ?? normalized[normalized.length - 1]?.projected ?? null,
    };
  }

  const mrrVals = lastFor(mrr);
  const ndrVals = lastFor(ndr);
  const ccrVals = lastFor(ccr);
  const newBizVals = lastFor(newBiz);
  const expVals = lastFor(exp);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Árbol del MRR</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          {mrr && (
            <Node
              label="MRR Target"
              sublabel="Norte estratégico"
              target={mrr.target}
              current={mrrVals.current}
              projected={mrrVals.projected}
              unit={mrr.unit}
              direction={mrr.direction}
            />
          )}
        </div>

        <div className="space-y-3 md:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Base retenida
          </div>
          {ndr && (
            <Node
              label="NDR"
              target={ndr.target}
              current={ndrVals.current}
              projected={ndrVals.projected}
              unit={ndr.unit}
              direction={ndr.direction}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            {ccr && (
              <Node
                label="CCR"
                target={ccr.target}
                current={ccrVals.current}
                projected={ccrVals.projected}
                unit={ccr.unit}
                direction={ccr.direction}
              />
            )}
            {exp && (
              <Node
                label="Expansion MRR"
                target={exp.target}
                current={expVals.current}
                projected={expVals.projected}
                unit={exp.unit}
                direction={exp.direction}
              />
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Nuevo negocio
          </div>
          {newBiz && (
            <Node
              label="New Biz MRR"
              sublabel="30 clientes/mes × $452 ASP"
              target={newBiz.target}
              current={newBizVals.current}
              projected={newBizVals.projected}
              unit={newBiz.unit}
              direction={newBiz.direction}
            />
          )}
        </div>
      </div>
    </div>
  );
}
