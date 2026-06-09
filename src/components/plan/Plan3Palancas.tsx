import { formatKPIValueFull, type KPIDirection } from "@/lib/plan/calculations";

type KPI = {
  slug: string;
  target: number;
  baseline?: number;
  unit: string;
  direction: KPIDirection;
};

const LEVERS = [
  {
    number: 1,
    title: "Reducir Churn",
    subtitle: "CCR 7% → 3%",
    accent: "from-rose-50 to-white border-rose-200",
    badge: "bg-rose-100 text-rose-700",
  },
  {
    number: 2,
    title: "Escalar Expansión",
    subtitle: "Repricing + upselling",
    accent: "from-emerald-50 to-white border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
  },
  {
    number: 3,
    title: "Crecer Adquisición",
    subtitle: "30 clientes nuevos/mes",
    accent: "from-mawi-50 to-white border-mawi-200",
    badge: "bg-mawi-100 text-mawi-700",
  },
];

export function Plan3Palancas({ kpis }: { kpis: KPI[] }) {
  const ndr = kpis.find((k) => k.slug === "ndr");
  const mrr = kpis.find((k) => k.slug === "mrr");
  const ccr = kpis.find((k) => k.slug === "ccr");

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-mawi-900 to-mawi-700 p-6 text-white shadow-sm md:p-8">
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mawi-200">
            Plan de Crecimiento · Segundo Semestre 2026
          </p>
          <h2 className="mt-3 max-w-2xl text-xl font-semibold leading-snug md:text-2xl">
            El NDR es nuestra North Star. Si retenemos y expandimos lo que ya
            tenemos, todo lo demás se suma encima.
          </h2>
        </div>

        {ndr && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 backdrop-blur-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mawi-200">
              ★ NDR · North Star
            </div>
            <div className="mt-1 text-5xl font-bold leading-none text-white">
              {formatKPIValueFull(ndr.target, ndr.unit)}
            </div>
            <div className="mt-1 text-xs text-mawi-200">
              Meta diciembre · base{" "}
              {ndr.baseline !== undefined
                ? formatKPIValueFull(ndr.baseline, ndr.unit)
                : "—"}
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {mrr && (
          <div>
            <span className="text-mawi-200">MRR Diciembre · </span>
            <span className="font-semibold text-white">
              {formatKPIValueFull(mrr.target, mrr.unit)}
            </span>
          </div>
        )}
        {ccr && (
          <div>
            <span className="text-mawi-200">CCR · </span>
            <span className="font-semibold text-white">
              ≤ {formatKPIValueFull(ccr.target, ccr.unit)}
            </span>
            <span className="ml-1 text-mawi-200">· CEO</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {LEVERS.map((lever) => (
          <div
            key={lever.number}
            className={`rounded-xl border bg-gradient-to-br ${lever.accent} p-4 text-gray-900 shadow-sm`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${lever.badge}`}
              >
                {lever.number}
              </span>
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {lever.title}
                </div>
                <div className="text-xs text-gray-600">{lever.subtitle}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
