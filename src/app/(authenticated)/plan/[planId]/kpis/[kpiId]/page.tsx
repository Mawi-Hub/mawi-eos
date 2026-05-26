import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PlanKPIChart } from "@/components/plan/PlanKPIChart";
import { PlanSemaforo } from "@/components/plan/PlanSemaforo";
import { PlanProgressBar } from "@/components/plan/PlanProgressBar";
import {
  formatKPIValueFull,
  getKPIStatus,
  getDynamicProjection,
  lastRealEntry,
  type KPIDirection,
} from "@/lib/plan/calculations";
import { PlanEntryForm } from "./entry-form";

export default async function PlanKPIDetailPage({
  params,
}: {
  params: Promise<{ planId: string; kpiId: string }>;
}) {
  const { planId, kpiId } = await params;
  const session = await auth();

  const kpi = await prisma.planKPI.findUnique({
    where: { id: kpiId },
    include: {
      entries: { orderBy: { period: "asc" } },
      owner: { select: { id: true, name: true, role: true } },
    },
  });

  if (!kpi || kpi.planId !== planId) notFound();

  const direction = kpi.direction as KPIDirection;
  const normalized = kpi.entries.map((e) => ({
    period: e.period,
    projected: e.projected,
    actual: e.actual,
  }));
  const last = lastRealEntry(normalized);
  const currentValue = last?.actual ?? null;
  const dynamic = getDynamicProjection(normalized, kpi.target, direction);

  const canEdit =
    session?.user.role === "ceo" || session?.user.id === kpi.ownerId;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{kpi.name}</h2>
            <p className="text-sm text-gray-500">
              {kpi.owner.name} · {kpi.category.toLowerCase()}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900">
              {formatKPIValueFull(currentValue, kpi.unit)}
            </div>
            <div className="text-xs text-gray-400">
              / {formatKPIValueFull(kpi.target, kpi.unit)} meta
            </div>
          </div>
        </div>

        <PlanProgressBar
          current={currentValue}
          baseline={kpi.baseline}
          target={kpi.target}
          direction={direction}
          unit={kpi.unit}
        />

        {last && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
            <span className="text-gray-500">A este ritmo: </span>
            <span
              className={
                dynamic.onTrackForStretch
                  ? "font-semibold text-emerald-700"
                  : "font-semibold text-amber-700"
              }
            >
              {formatKPIValueFull(dynamic.projectedFinal, kpi.unit)}
            </span>
            <span className="text-gray-500"> en diciembre — </span>
            {dynamic.onTrackForStretch ? (
              <span className="text-emerald-700">STRETCH alcanzable</span>
            ) : (
              <span className="text-amber-700">por debajo del STRETCH</span>
            )}
          </div>
        )}

        <div className="mt-6">
          <PlanKPIChart
            entries={normalized}
            target={kpi.target}
            unit={kpi.unit}
            direction={direction}
            height={280}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Mes</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Proyectado</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Real</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Δ%</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {kpi.entries.map((e) => {
              const status = getKPIStatus(e.actual, e.projected, direction);
              const delta =
                e.actual !== null
                  ? direction === "ABOVE"
                    ? ((e.actual - e.projected) / e.projected) * 100
                    : ((e.projected - e.actual) / e.projected) * 100
                  : null;
              return (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {new Date(e.period).toLocaleDateString("es", {
                      month: "long",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">
                    {formatKPIValueFull(e.projected, kpi.unit)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    {formatKPIValueFull(e.actual, kpi.unit)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm ${
                      delta === null ? "text-gray-400" : delta >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-3">
                    <PlanSemaforo status={status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{e.note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Ingresar valor real</h3>
          <PlanEntryForm
            planId={planId}
            kpiId={kpi.id}
            unit={kpi.unit}
            entries={kpi.entries.map((e) => ({
              period: e.period.toISOString(),
              projected: e.projected,
              actual: e.actual,
            }))}
          />
        </div>
      )}
    </div>
  );
}
