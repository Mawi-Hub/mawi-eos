import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLeaderRole } from "@/lib/access";
import { Sidebar } from "@/components/layout/sidebar";

const DEFAULT_HANDBOOK = "https://app.notion.com/p/3a59223bd33080f9a8bff8d161512f59";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // El nombre del plan sale de la base (antes "Plan H2" fijo en el código).
  const plan = await prisma.plan.findFirst({ where: { status: "ACTIVE" }, select: { name: true }, orderBy: { startDate: "desc" } });
  const handbookUrl = process.env.HANDBOOK_URL?.trim() === "" ? null : (process.env.HANDBOOK_URL?.trim() ?? DEFAULT_HANDBOOK);

  return (
    <div className="flex h-full">
      <Sidebar
        userName={session.user.name}
        userRole={session.user.role}
        isLeader={isLeaderRole(session.user.role)}
        planLabel={plan ? `Plan ${plan.name}` : "Plan"}
        handbookUrl={handbookUrl}
      />
      <main className="min-w-0 flex-1 overflow-y-auto bg-gray-50 p-4 pt-18 md:p-8">{children}</main>
    </div>
  );
}
