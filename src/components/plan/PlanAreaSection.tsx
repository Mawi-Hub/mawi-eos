import { PlanKPICard } from "./PlanKPICard";
import type { KPIDirection } from "@/lib/plan/calculations";

type Area = "COMERCIAL" | "CUSTOMER_SUCCESS" | "PRODUCTO" | "INGENIERIA";

type Entry = { period: Date | string; projected: number; actual: number | null };

type KPI = {
  id: string;
  slug: string;
  name: string;
  unit: string;
  direction: KPIDirection;
  target: number;
  isPrincipal: boolean;
  owner: { name: string };
  entries: Entry[];
};

type Action = {
  id: string;
  title: string;
  expectedImpact: string | null;
  displayOrder: number;
};

type Risk = {
  id: string;
  title: string;
  description: string | null;
  displayOrder: number;
};

type AreaMeta = {
  label: string;
  lever: string;
  headerClass: string;
  badgeClass: string;
  accentBorder: string;
  pillBg: string;
};

const AREA_META: Record<Area, AreaMeta> = {
  COMERCIAL: {
    label: "Comercial",
    lever: "Crecer adquisición",
    headerClass: "bg-gradient-to-br from-mawi-700 to-mawi-500",
    badgeClass: "bg-mawi-100 text-mawi-800",
    accentBorder: "border-mawi-200",
    pillBg: "bg-mawi-50 text-mawi-700",
  },
  CUSTOMER_SUCCESS: {
    label: "Customer Success",
    lever: "Reducir churn · Escalar expansión",
    headerClass: "bg-gradient-to-br from-emerald-700 to-emerald-500",
    badgeClass: "bg-emerald-100 text-emerald-800",
    accentBorder: "border-emerald-200",
    pillBg: "bg-emerald-50 text-emerald-700",
  },
  PRODUCTO: {
    label: "Producto",
    lever: "Reducir churn · Activar hábito",
    headerClass: "bg-gradient-to-br from-sky-700 to-sky-500",
    badgeClass: "bg-sky-100 text-sky-800",
    accentBorder: "border-sky-200",
    pillBg: "bg-sky-50 text-sky-700",
  },
  INGENIERIA: {
    label: "Ingeniería",
    lever: "Reducir churn · Calidad y velocidad",
    headerClass: "bg-gradient-to-br from-amber-700 to-amber-500",
    badgeClass: "bg-amber-100 text-amber-800",
    accentBorder: "border-amber-200",
    pillBg: "bg-amber-50 text-amber-700",
  },
};

export function PlanAreaSection({
  planId,
  area,
  ownerName,
  kpis,
  actions,
  risks,
}: {
  planId: string;
  area: Area;
  ownerName: string;
  kpis: KPI[];
  actions: Action[];
  risks: Risk[];
}) {
  const meta = AREA_META[area];
  const principal = kpis.find((k) => k.isPrincipal);

  return (
    <section
      className={`overflow-hidden rounded-2xl border ${meta.accentBorder} bg-white shadow-sm`}
    >
      <header className={`${meta.headerClass} px-6 py-5 text-white`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
              {meta.lever}
            </div>
            <h2 className="mt-1 text-2xl font-bold">{meta.label}</h2>
            <p className="mt-1 text-xs opacity-90">Owner · {ownerName}</p>
          </div>
          {principal && (
            <div className={`rounded-lg ${meta.pillBg} px-3 py-2 text-xs font-medium`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                KPI principal
              </div>
              <div className="text-sm font-semibold">{principal.name}</div>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Top 5 Acciones
          </h3>
          <ol className="space-y-3">
            {actions.map((action, idx) => (
              <li key={action.id} className="flex gap-3">
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.badgeClass} text-xs font-semibold`}
                >
                  {idx + 1}
                </span>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {action.title}
                  </div>
                  {action.expectedImpact && (
                    <div className="mt-0.5 text-xs text-gray-500">
                      {action.expectedImpact}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Top 3 Riesgos
          </h3>
          <ul className="space-y-3">
            {risks.map((risk) => (
              <li
                key={risk.id}
                className="rounded-lg border border-amber-200 bg-amber-50/60 p-3"
              >
                <div className="text-sm font-medium text-amber-900">
                  {risk.title}
                </div>
                {risk.description && (
                  <div className="mt-1 text-xs text-amber-800/80">
                    {risk.description}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {kpis.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            KPIs del área
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi) => (
              <PlanKPICard
                key={kpi.id}
                planId={planId}
                kpiId={kpi.id}
                name={kpi.name}
                unit={kpi.unit}
                direction={kpi.direction}
                target={kpi.target}
                ownerName={kpi.owner.name}
                entries={kpi.entries}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
