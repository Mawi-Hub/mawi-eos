import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { EditRoleForm } from "./edit-role-form";
import Link from "next/link";
import { isSelectionEnabled } from "@/lib/report/config";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import { Shield, CheckCircle, AlertTriangle, BarChart3 } from "lucide-react";

export default async function AccountabilityChartPage() {
  const session = await auth();
  const isCeo = session?.user?.role === "ceo";

  const roles = await prisma.accountabilityRole.findMany({
    include: { user: true },
    orderBy: { sortOrder: "asc" },
  });

  // Con la selección activa: métricas oficiales del área que lidera cada
  // persona (ReportArea.leaderId/alternateId), no deducidas del texto del rol.
  // keyMetrics sigue siendo texto libre y no se interpreta.
  const selectionOn = isSelectionEnabled();
  const activeQuarter = selectionOn ? await prisma.quarter.findFirst({ where: { isActive: true } }) : null;
  const areaMetricsByUser = new Map<string, Array<{ id: string; label: string; areaName: string }>>();
  if (selectionOn && activeQuarter) {
    const [areas, selection] = await Promise.all([
      prisma.reportArea.findMany({ where: { active: true }, select: { id: true, name: true, leaderId: true, alternateId: true } }),
      getQuarterSelection(activeQuarter.id),
    ]);
    for (const area of areas) {
      const rows = selection.rows.filter((r) => r.areaId === area.id);
      for (const userId of new Set([area.leaderId, area.alternateId].filter((v): v is string => !!v))) {
        const list = areaMetricsByUser.get(userId) ?? [];
        for (const r of rows) list.push({ id: r.selectionId, label: r.label, areaName: area.name });
        areaMetricsByUser.set(userId, list);
      }
    }
  }
  const quarterLabel = activeQuarter ? `Q${activeQuarter.quarter} ${activeQuarter.year}` : "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accountability Chart</h1>
        <p className="mt-1 text-sm text-gray-500">
          Responsabilidades, autonomía y métricas de cada rol
        </p>
      </div>

      {roles.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No hay roles definidos aún.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {roles.map((role) => (
            <div key={role.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between bg-mawi-50 px-6 py-4 border-b border-gray-200">
                <div>
                  <h2 className="text-lg font-semibold text-mawi-900">{role.user.name}</h2>
                  <p className="text-sm text-mawi-700">{role.title}</p>
                </div>
                {isCeo && (
                  <EditRoleForm
                    role={{
                      id: role.id,
                      userId: role.userId,
                      title: role.title,
                      responsibilities: role.responsibilities,
                      decidesAlone: role.decidesAlone,
                      requiresApproval: role.requiresApproval,
                      keyMetrics: role.keyMetrics,
                      sortOrder: role.sortOrder,
                    }}
                  />
                )}
              </div>

              <div className="grid gap-0 md:grid-cols-2">
                {/* Responsabilidades */}
                <div className="p-5 border-b md:border-b-0 md:border-r border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="h-4 w-4 text-mawi-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Responsabilidades</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {role.responsibilities.map((item, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mawi-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Decide sin escalar */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <h3 className="text-sm font-semibold text-gray-900">{role.requiresApproval.length === 0 ? "Decide" : "Decide sin escalar"}</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {role.decidesAlone.map((item, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Escala o consulta antes */}
                {role.requiresApproval.length > 0 && (
                  <div className="p-5 border-b md:border-b-0 md:border-r border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <h3 className="text-sm font-semibold text-gray-900">Escala o consulta antes</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {role.requiresApproval.map((item, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Métricas clave */}
                <div className={`p-5 ${role.requiresApproval.length === 0 ? "md:border-r border-gray-100" : ""}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Métricas clave</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {role.keyMetrics.map((item, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {selectionOn && (
                    <div className="mt-4 border-t border-gray-100 pt-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Métricas del área en {quarterLabel}
                      </h4>
                      {(areaMetricsByUser.get(role.userId) ?? []).length === 0 ? (
                        <p className="mt-1 text-xs text-gray-400">Sin métricas seleccionadas para un área a su cargo.</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {areaMetricsByUser.get(role.userId)!.map((m) => (
                            <li key={m.id} className="text-xs">
                              <Link href="/scorecard" className="text-mawi-700 hover:underline">
                                {m.label}
                              </Link>
                              <span className="text-gray-400"> · {m.areaName}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
