import { formatKPIValueFull, type KPIDirection } from "@/lib/plan/calculations";

type KPI = {
  slug: string;
  target: number;
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
    subtitle: "25–30 clientes nuevos/mes",
    accent: "from-mawi-50 to-white border-mawi-200",
    badge: "bg-mawi-100 text-mawi-700",
  },
];

export function Plan3Palancas({ kpis }: { kpis: KPI[] }) {
  const mrr = kpis.find((k) => k.slug === "mrr");
  const ndr = kpis.find((k) => k.slug === "ndr");

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-mawi-900 p-6 text-white shadow-sm md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mawi-200">
            Plan de Crecimiento · Segundo Semestre 2026
          </p>
          <h2 className="mt-2 max-w-2xl text-xl font-semibold leading-snug md:text-2xl">
            Vamos a casi duplicar el MRR de aquí a diciembre. Vamos a retener lo
            que ganamos. Y lo vamos a hacer juntos.
          </h2>
        </div>

        <div className="flex gap-6">
          {mrr && (
            <div>
              <div className="text-2xl font-bold text-white md:text-3xl">
                {formatKPIValueFull(mrr.target, mrr.unit)}
              </div>
              <div className="text-xs uppercase tracking-wider text-mawi-200">
                MRR Diciembre
              </div>
            </div>
          )}
          {ndr && (
            <div>
              <div className="text-2xl font-bold text-white md:text-3xl">
                {formatKPIValueFull(ndr.target, ndr.unit)}
              </div>
              <div className="text-xs uppercase tracking-wider text-mawi-200">
                NDR · North Star
              </div>
            </div>
          )}
        </div>
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
