import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { PRIORITY_CONFIG } from "@/lib/utils";
import AddWinButton from "./add-win-button";
import AddChallengeButton from "./add-challenge-button";
import EditWinButton from "./edit-win-button";
import EditChallengeButton from "./edit-challenge-button";

export default async function WinsChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const viewMode = params.view === "all" ? "all" : "cycle";

  const activeQuarter = await prisma.quarter.findFirst({
    where: { isActive: true },
  });

  if (!activeQuarter) {
    return <div className="py-12 text-center text-gray-500">No hay trimestre activo.</div>;
  }

  // Get the last closed meeting to determine cycle start
  const lastClosedMeeting = await prisma.l10Meeting.findFirst({
    where: { quarterId: activeQuarter.id, status: "completed" },
    orderBy: { date: "desc" },
  });

  const cycleStart = lastClosedMeeting ? new Date(lastClosedMeeting.updatedAt) : null;

  const entries = await prisma.winChallenge.findMany({
    where: {
      quarterId: activeQuarter.id,
      ...(viewMode === "cycle" && cycleStart ? { reportDate: { gte: cycleStart } } : {}),
    },
    include: { user: true },
    orderBy: [{ reportDate: "desc" }, { user: { name: "asc" } }],
  });

  const wins = entries.filter((e) => e.entryType === "win" || (!e.entryType && e.wins));
  const challenges = entries.filter((e) => e.entryType === "challenge" || (!e.entryType && e.keyChallenge && !e.wins));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wins & Challenges</h1>
          <p className="mt-1 text-sm text-gray-500">
            Q{activeQuarter.quarter} {activeQuarter.year}
            {viewMode === "cycle" && cycleStart && (
              <span className="ml-2 text-gray-400">
                · Ciclo desde {new Date(cycleStart).toLocaleDateString("es", { day: "numeric", month: "long" })}
              </span>
            )}
          </p>
        </div>

        {cycleStart && (
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            <a
              href="/wins-challenges"
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "cycle" ? "bg-mawi-100 text-mawi-800" : "text-gray-500 hover:text-gray-900"}`}
            >
              Ciclo actual
            </a>
            <a
              href="/wins-challenges?view=all"
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "all" ? "bg-mawi-100 text-mawi-800" : "text-gray-500 hover:text-gray-900"}`}
            >
              Todo el trimestre
            </a>
          </div>
        )}
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

          {wins.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-400">
              {viewMode === "cycle" ? "Sin wins en este ciclo todavía" : "Sin wins registrados"}
            </div>
          )}

          {wins.map((entry) => {
            const isOwner = session?.user?.id === entry.userId;
            return (
              <div key={entry.id} className="rounded-lg border border-emerald-100 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{entry.user.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {new Date(entry.reportDate).toLocaleDateString("es", { day: "numeric", month: "short" })}
                    </span>
                    {isOwner && (
                      <EditWinButton
                        id={entry.id}
                        currentWins={entry.wins || ""}
                        currentResult={entry.result || ""}
                      />
                    )}
                  </div>
                </div>

                <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{entry.wins}</p>

                {entry.result && (
                  <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Resultado</div>
                    <p className="mt-0.5 text-sm font-medium text-emerald-800">{entry.result}</p>
                  </div>
                )}
              </div>
            );
          })}
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

          {challenges.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-400">
              {viewMode === "cycle" ? "Sin challenges en este ciclo todavía" : "Sin challenges registrados"}
            </div>
          )}

          {challenges.map((entry) => {
            const priorityConfig = PRIORITY_CONFIG[entry.priority] || PRIORITY_CONFIG.medio;
            const isOwner = session?.user?.id === entry.userId;

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
                    {isOwner && (
                      <EditChallengeButton
                        id={entry.id}
                        currentKeyChallenge={entry.keyChallenge || ""}
                        currentFollowUpAction={entry.followUpAction || ""}
                        currentPriority={entry.priority}
                      />
                    )}
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
