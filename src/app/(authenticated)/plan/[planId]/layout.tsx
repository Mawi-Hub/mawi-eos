import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function PlanLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) notFound();

  const now = new Date();
  // Compute months difference in Costa Rica time, so a deadline like
  // "Dec 31 23:59 CR" still reads as December 2026 (not January 2027 UTC).
  const crParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "numeric",
  });
  function ym(d: Date) {
    const p = crParts.formatToParts(d);
    return {
      year: Number(p.find((x) => x.type === "year")?.value),
      month: Number(p.find((x) => x.type === "month")?.value) - 1,
    };
  }
  const nowYM = ym(now);
  const endYM = ym(plan.endDate);
  const monthsLeft = Math.max(
    0,
    (endYM.year - nowYM.year) * 12 + (endYM.month - nowYM.month)
  );
  const monthsLabel =
    monthsLeft === 0 ? "último mes" : `${monthsLeft} ${monthsLeft === 1 ? "mes" : "meses"} para la meta`;

  const startFmt = plan.startDate.toLocaleDateString("es", {
    month: "short",
    year: "numeric",
    timeZone: "America/Costa_Rica",
  });
  const endFmt = plan.endDate.toLocaleDateString("es", {
    month: "short",
    year: "numeric",
    timeZone: "America/Costa_Rica",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {startFmt} → {endFmt} · {monthsLabel} ·{" "}
            <span className="font-medium uppercase text-mawi-700">{plan.status}</span>
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link
            href={`/plan/${planId}`}
            className="rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-100"
          >
            Overview
          </Link>
          <Link
            href={`/plan/${planId}/kpis`}
            className="rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-100"
          >
            KPIs
          </Link>
          <Link
            href={`/plan/${planId}/proposals`}
            className="rounded-md px-3 py-1.5 text-gray-600 hover:bg-gray-100"
          >
            Propuestas
          </Link>
        </nav>
      </div>

      {children}
    </div>
  );
}
