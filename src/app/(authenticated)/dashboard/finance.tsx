import { prisma } from "@/lib/db";
import { SyncButton } from "./sync-button";
import { formatRate, type RateDetail } from "@/lib/l10/dashboardFormat";

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
  // null = sin muestra (nunca 0.0%). El detalle n/N puede venir o no.
  showRate: number | null;
  closeRate: number | null;
  showRateDetail?: RateDetail;
  closeRateDetail?: RateDetail;
  avgSalesCycleDays: number | null;
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

// Finanzas y adquisición (ChartMogul y HubSpot), tal como estaban; sin los
// placeholders de PostHog ni las notas de implementación.
export async function FinanceSection() {
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

  const showRate = formatRate(pipelineMetrics?.showRate, pipelineMetrics?.showRateDetail);
  const closeRate = formatRate(pipelineMetrics?.closeRate, pipelineMetrics?.closeRateDetail);

  const cmSyncedAt = cache["chartmogul:mrr_breakdown"]?.syncedAt;
  const hsSyncedAt = cache["hubspot:pipeline_metrics"]?.syncedAt;

  function formatDate(d: Date | undefined) {
    if (!d) return "Nunca";
    return new Date(d).toLocaleString("es", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              label="MRR Neto"
              value={`$${lastMRR.mrr.toLocaleString()}`}
              subtitle={prevMRR && prevMRR.mrr > 0 ? `${((lastMRR.mrr - prevMRR.mrr) / prevMRR.mrr * 100).toFixed(1)}% vs mes anterior` : undefined}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              label="Leads por canal"
              value={Object.values(pipelineMetrics.leadsByChannel).reduce((a, b) => a + b, 0).toString()}
              subtitle={Object.entries(pipelineMetrics.leadsByChannel).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              color="text-gray-900"
            />
            <KPICard
              label="Show Rate"
              value={showRate.text}
              subtitle={`Demos realizadas / agendadas${showRate.detail ? ` · ${showRate.detail}` : ""}`}
              color={showRate.hasSample ? "text-gray-900" : "text-gray-400"}
            />
            <KPICard
              label="Close Rate"
              value={closeRate.text}
              subtitle={`Cierres / demos realizadas${closeRate.detail ? ` · ${closeRate.detail}` : ""}`}
              color={closeRate.hasSample ? "text-gray-900" : "text-gray-400"}
            />
            <KPICard
              label="Ciclo de Venta"
              value={typeof pipelineMetrics.avgSalesCycleDays === "number" && Number.isFinite(pipelineMetrics.avgSalesCycleDays) ? `${pipelineMetrics.avgSalesCycleDays.toFixed(0)} días` : "Sin muestra"}
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

    </div>
  );
}
