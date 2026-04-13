import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { EditRoleForm } from "./edit-role-form";
import { Shield, CheckCircle, AlertTriangle, BarChart3 } from "lucide-react";

export default async function AccountabilityChartPage() {
  const session = await auth();
  const isCeo = session?.user?.role === "ceo";

  const roles = await prisma.accountabilityRole.findMany({
    include: { user: true },
    orderBy: { sortOrder: "asc" },
  });

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
                    <h3 className="text-sm font-semibold text-gray-900">Decide sin escalar</h3>
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

                {/* Requiere aprobación */}
                {role.requiresApproval.length > 0 && (
                  <div className="p-5 border-b md:border-b-0 md:border-r border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <h3 className="text-sm font-semibold text-gray-900">Requiere aprobación</h3>
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
