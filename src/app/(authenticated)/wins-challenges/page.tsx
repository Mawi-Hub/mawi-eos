import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PRIORITY_CONFIG } from "@/lib/utils";
import AddWinButton from "./add-win-button";
import AddChallengeButton from "./add-challenge-button";

export default async function WinsChallengesPage() {
  const session = await auth();
  const activeQuarter = await prisma.quarter.findFirst({
    where: { isActive: true },
  });

  if (!activeQuarter) {
    return <div className="py-12 text-center text-gray-500">No hay trimestre activo.</div>;
  }

  const entries = await prisma.winChallenge.findMany({
    where: { quarterId: activeQuarter.id },
    include: { user: true },
    orderBy: [{ reportDate: "desc" }, { user: { name: "asc" } }],
  });

  const wins = entries.filter((e) => e.entryType === "win" || (!e.entryType && e.wins));
  const challenges = entries.filter((e) => e.entryType === "challenge" || (!e.entryType && e.keyChallenge && !e.wins));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Wins & Challenges</h1>
        <p className="mt-1 text-sm text-gray-500">
          Q{activeQuarter.quarter} {activeQuarter.year}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Wins column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <h2 className="text-lg font-semibold text-gray-900">Wins</h2>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {wins.length}
            </span>
          </div>

          <AddWinButton quarterId={activeQuarter.id} />

          {wins.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-emerald-100 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{entry.user.name}</span>
                <span className="text-xs text-gray-400">
                  {new Date(entry.reportDate).toLocaleDateString("es", { day: "numeric", month: "short" })}
                </span>
              </div>

              <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{entry.wins}</p>

              {entry.result && (
                <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Resultado</div>
                  <p className="mt-0.5 text-sm font-medium text-emerald-800">{entry.result}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Challenges column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">Challenges</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {challenges.length}
            </span>
          </div>

          <AddChallengeButton quarterId={activeQuarter.id} />

          {challenges.map((entry) => {
            const priorityConfig = PRIORITY_CONFIG[entry.priority] || PRIORITY_CONFIG.medio;

            return (
              <div key={entry.id} className="rounded-lg border border-amber-100 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{entry.user.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityConfig.className}`}>
                      {priorityConfig.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(entry.reportDate).toLocaleDateString("es", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{entry.keyChallenge}</p>

                {entry.followUpAction && (
                  <div className="mt-3 rounded-md bg-mawi-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-mawi-600">Acción siguiente</div>
                    <p className="mt-0.5 text-sm font-medium text-mawi-800">{entry.followUpAction}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
