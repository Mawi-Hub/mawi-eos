import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { STATUS_CONFIG } from "@/lib/utils";
import { CloseQuarterButton } from "./close-quarter-button";

export default async function QuarterlyPage() {
  const session = await auth();
  const isCeo = session?.user?.role === "ceo";

  const quarters = await prisma.quarter.findMany({
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
    include: {
      rocks: { include: { owner: true } },
      _count: {
        select: { scorecardEntries: true, winsAndChallenges: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trimestres</h1>
        <p className="mt-1 text-sm text-gray-500">Historial y gestión de ciclos EOS</p>
      </div>

      <div className="space-y-6">
        {quarters.map((q) => (
          <div key={q.id} className={`rounded-lg border bg-white p-6 ${q.isActive ? "border-mawi-300 ring-2 ring-mawi-100" : "border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">
                  Q{q.quarter} {q.year}
                </h2>
                {q.isActive && (
                  <span className="rounded-full bg-mawi-100 px-2.5 py-0.5 text-xs font-medium text-mawi-700">
                    Activo
                  </span>
                )}
              </div>
              {isCeo && q.isActive && (
                <CloseQuarterButton quarterId={q.id} year={q.year} quarter={q.quarter} />
              )}
            </div>

            <div className="mt-2 text-xs text-gray-400">
              {new Date(q.startDate).toLocaleDateString("es")} — {new Date(q.endDate).toLocaleDateString("es")}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xl font-bold text-gray-900">{q.rocks.length}</div>
                <div className="text-xs text-gray-500">Rocks</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xl font-bold text-gray-900">{q._count.scorecardEntries}</div>
                <div className="text-xs text-gray-500">Scorecard entries</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xl font-bold text-gray-900">{q._count.winsAndChallenges}</div>
                <div className="text-xs text-gray-500">Wins & Challenges</div>
              </div>
            </div>

            {q.rocks.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-gray-700">Rocks</h3>
                <div className="space-y-2">
                  {q.rocks.map((rock) => {
                    const status = rock.finalStatus || rock.status;
                    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                    return (
                      <div key={rock.id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{rock.title}</span>
                          <span className="ml-2 text-xs text-gray-400">{rock.owner.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{rock.progress}%</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
