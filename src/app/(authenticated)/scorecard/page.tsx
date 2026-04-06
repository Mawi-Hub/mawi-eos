import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { CATEGORIES, STATUS_CONFIG } from "@/lib/utils";
import { ScorecardEntryForm } from "./entry-form";

export default async function ScorecardPage() {
  const session = await auth();
  const metrics = await prisma.scorecardMetric.findMany({
    where: { isActive: true },
    include: {
      owner: true,
      entries: {
        orderBy: { periodStart: "desc" },
        take: 1,
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const activeQuarter = await prisma.quarter.findFirst({
    where: { isActive: true },
  });

  const grouped = Object.entries(CATEGORIES).map(([key, config]) => ({
    key,
    ...config,
    metrics: metrics.filter((m) => m.category === key),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scorecard</h1>
        <p className="mt-1 text-sm text-gray-500">
          {activeQuarter
            ? `Q${activeQuarter.quarter} ${activeQuarter.year}`
            : "Sin trimestre activo"}
        </p>
      </div>

      {grouped.map((group) => (
        <div key={group.key}>
          <div className="mb-4 flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${group.color}`} />
            <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Métrica</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Valor Actual</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Frecuencia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.metrics.map((metric) => {
                  const lastEntry = metric.entries[0];
                  const status = lastEntry?.status || "pending";
                  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                  const isOwner = session?.user?.id === metric.ownerId;

                  return (
                    <tr key={metric.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{metric.name}</div>
                        <div className="text-xs text-gray-500">{metric.calculation}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{metric.owner.name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {lastEntry?.actualDisplay || lastEntry?.actualValue?.toString() || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{metric.targetValue || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-gray-500">{metric.frequency}</td>
                      <td className="px-4 py-3">
                        {isOwner && activeQuarter && (
                          <ScorecardEntryForm
                            metricId={metric.id}
                            metricName={metric.name}
                            quarterId={activeQuarter.id}
                            unit={metric.unit}
                            targetNumeric={metric.targetNumeric}
                            targetDirection={metric.targetDirection}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
