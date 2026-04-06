import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SyncButton } from "./sync-button";

interface MRREntry {
  date: string;
  mrr: number;
  mrrNewBusiness: number;
  mrrExpansion: number;
  mrrContraction: number;
  mrrChurn: number;
}

interface PipelineMetrics {
  leadsByChannel: Record<string, number>;
  showRate: number;
  closeRate: number;
  avgSalesCycleDays: number;
}

function KPICard({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="mt-1 text-xs text-gray-400">{subtitle}</div>}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, string> = {
    chartmogul: "bg-blue-50 text-blue-700",
    hubspot: "bg-amber-50 text-amber-700",
    posthog: "bg-green-50 text-green-700",
  };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-medium ${config[source] || "bg-gray-50 text-gray-600"}`}>
      {source === "chartmogul" ? "ChartMogul" : source === "hubspot" ? "HubSpot" : "PostHog"}
    </span>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (session?.user?.role !== "ceo") redirect("/scorecard");

  // Fetch cached data
  const caches = await prisma.apiSyncCache.findMany();
  const cache: Record<string, { data: unknown; syncedAt: Date }> = {};
  for (const c of caches) {
    cache[`${c.source}:${c.dataKey}`] = { data: c.data, syncedAt: c.syncedAt };
  }

  const mrrData = (cache["chartmogul:mrr_breakdown"]?.data || []) as MRREntry[];
  const lastMRR = mrrData[mrrData.length - 1];
  const prevMRR = mrrData[mrrData.length - 2];

  const pipelineMetrics = (cache["hubspot:pipeline_metrics"]?.data || null) as PipelineMetrics | null;

  const cmSyncedAt = cache["chartmogul:mrr_breakdown"]?.syncedAt;
  const hsSyncedAt = cache["hubspot:pipeline_metrics"]?.syncedAt;
  const phSyncedAt = cache["posthog:engagement_data"]?.syncedAt;

  function formatDate(d: Date | undefined) {
    if (!d) return "Nunca";
    return new Date(d).toLocaleString("es", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CEO Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Vista consolidada de salud del negocio</p>
        </div>
        <SyncButton />
      </div>

      {/* Layer 1: Business Health - ChartMogul */}
      <section>
        <div className="mb-4 flex items-center gap-3 border-l-4 border-blue-500 pl-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Capa 1 — Salud del negocio</h2>
            <p className="text-xs text-gray-400">¿Estamos creciendo o muriendo?</p>
          </div>
          <SourceBadge source="chartmogul" />
          <span className="text-[10px] text-gray-400">Sync: {formatDate(cmSyncedAt)}</span>
        </div>

        {lastMRR ? (
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              label="MRR Neto"
              value={`$${lastMRR.mrr.toLocaleString()}`}
              subtitle={prevMRR ? `${((lastMRR.mrr - prevMRR.mrr) / prevMRR.mrr * 100).toFixed(1)}% vs mes anterior` : undefined}
              color="text-gray-900"
            />
            <KPICard
              label="Churn MRR"
              value={`$${Math.abs(lastMRR.mrrChurn).toLocaleString()}`}
              subtitle="MRR perdido por cancelaciones"
              color="text-red-600"
            />
            <KPICard
              label="Expansion MRR"
              value={`$${lastMRR.mrrExpansion.toLocaleString()}`}
              subtitle="Upgrades de clientes existentes"
              color="text-emerald-600"
            />
            <KPICard
              label="New Business MRR"
              value={`$${lastMRR.mrrNewBusiness.toLocaleString()}`}
              subtitle="Clientes nuevos del mes"
              color="text-blue-600"
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <p className="text-sm text-gray-400">Sin datos de ChartMogul. Haz click en &quot;Sincronizar&quot; para cargar.</p>
          </div>
        )}
      </section>

      {/* Layer 2: Acquisition Signals - HubSpot */}
      <section>
        <div className="mb-4 flex items-center gap-3 border-l-4 border-amber-500 pl-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Capa 2 — Señales de adquisición</h2>
            <p className="text-xs text-gray-400">¿El pipeline es sano?</p>
          </div>
          <SourceBadge source="hubspot" />
          <span className="text-[10px] text-gray-400">Sync: {formatDate(hsSyncedAt)}</span>
        </div>

        {pipelineMetrics ? (
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              label="Leads por canal"
              value={Object.values(pipelineMetrics.leadsByChannel).reduce((a, b) => a + b, 0).toString()}
              subtitle={Object.entries(pipelineMetrics.leadsByChannel).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              color="text-gray-900"
            />
            <KPICard
              label="Show Rate"
              value={`${pipelineMetrics.showRate.toFixed(1)}%`}
              subtitle="Demos realizadas / agendadas"
              color="text-gray-900"
            />
            <KPICard
              label="Close Rate"
              value={`${pipelineMetrics.closeRate.toFixed(1)}%`}
              subtitle="Cierres / demos realizadas"
              color="text-gray-900"
            />
            <KPICard
              label="Ciclo de Venta"
              value={`${pipelineMetrics.avgSalesCycleDays.toFixed(0)} días`}
              subtitle="Promedio lead → cierre"
              color="text-gray-900"
            />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <p className="text-sm text-gray-400">Sin datos de HubSpot. Haz click en &quot;Sincronizar&quot; para cargar.</p>
          </div>
        )}
      </section>

      {/* Layer 3: Retention Signals - PostHog */}
      <section>
        <div className="mb-4 flex items-center gap-3 border-l-4 border-green-500 pl-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Capa 3 — Señales de retención</h2>
            <p className="text-xs text-gray-400">¿Quién se va antes de que se vaya?</p>
          </div>
          <SourceBadge source="posthog" />
          <span className="text-[10px] text-gray-400">Sync: {formatDate(phSyncedAt)}</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="text-xs font-medium text-gray-500">Adopción en 7 días</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">—</div>
            <div className="mt-1 text-xs text-gray-400">% nuevos clientes con ≥1 presupuesto y ≥1 gasto en 7 días</div>
            <div className="mt-2">
              <span className="inline-flex rounded bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">PostgreSQL</span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="text-xs font-medium text-gray-500">Clientes en riesgo</div>
            <div className="mt-2 text-2xl font-bold text-red-600">—</div>
            <div className="mt-1 text-xs text-gray-400">PES 0-1 por más de 21 días consecutivos</div>
            <SourceBadge source="posthog" />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="text-xs font-medium text-gray-500">Product Engagement Score</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">—</div>
            <div className="mt-1 text-xs text-gray-400">0-4 puntos: sesiones, presupuesto, gastos, usuarios activos</div>
            <SourceBadge source="posthog" />
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-xs text-gray-500 leading-relaxed">
          <strong>Notas de implementación:</strong><br/>
          <span className="inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">ChartMogul</span> Capas 1 disponibles con API key configurada.{" "}
          <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">HubSpot</span> Capa 2 requiere que Fede configure etapas del pipeline con fechas.{" "}
          <span className="inline-flex rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">PostHog</span> PES requiere definir los 4 eventos con Adrian (~2h).{" "}
          <span className="inline-flex rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">PostgreSQL</span> Adopción: endpoint read-only en backoffice (~30 min).
        </div>
      </section>
    </div>
  );
}
