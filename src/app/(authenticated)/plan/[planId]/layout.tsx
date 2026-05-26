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
  const daysLeft = Math.max(
    0,
    Math.ceil((plan.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  const startFmt = plan.startDate.toLocaleDateString("es", { month: "short", year: "numeric" });
  const endFmt = plan.endDate.toLocaleDateString("es", { month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {startFmt} → {endFmt} · {daysLeft} días restantes ·{" "}
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
