import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ScorecardCatalogTable } from "../catalog-table";

// Catálogo administrativo: todas las métricas activas por categoría. No es el
// reporte del trimestre (eso es /scorecard con la selección) sino una vista de
// diagnóstico solo para CEO.
export default async function ScorecardCatalogPage() {
  const session = await auth();
  if (session?.user?.role !== "ceo") redirect("/scorecard");

  const [metrics, activeQuarter] = await Promise.all([
    prisma.scorecardMetric.findMany({
      where: { isActive: true },
      include: { owner: true, entries: { orderBy: { periodStart: "desc" }, take: 1 } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.quarter.findFirst({ where: { isActive: true } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/scorecard" className="text-xs font-medium text-mawi-700 hover:underline">
          ← Volver al Scorecard
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Catálogo de métricas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vista administrativa y de diagnóstico: todas las métricas activas, estén o no en la selección del trimestre.
          Ocultar una métrica del reporte se hace quitándola de la selección, no desactivándola.
        </p>
      </div>
      <ScorecardCatalogTable metrics={metrics} userId={session?.user?.id} activeQuarterId={activeQuarter?.id ?? null} />
    </div>
  );
}
