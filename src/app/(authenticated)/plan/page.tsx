import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function PlanIndexPage() {
  const plan = await prisma.plan.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { startDate: "desc" },
  });

  if (!plan) {
    const fallback = await prisma.plan.findFirst({ orderBy: { startDate: "desc" } });
    if (!fallback) {
      return (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No hay planes creados todavía. Corré el seed de Plan H2 para empezar.
        </div>
      );
    }
    redirect(`/plan/${fallback.id}`);
  }

  redirect(`/plan/${plan.id}`);
}
