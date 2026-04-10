import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/utils";
import { CreateMeetingButton } from "./create-meeting-button";
import { AddIssueButton } from "./add-issue-button";
import { AddCommitmentButton } from "./add-commitment-button";
import { ResolveIssueButton } from "./resolve-issue-button";
import { ToggleCommitmentButton } from "./toggle-commitment-button";
import EditIssueButton from "./edit-issue-button";
import EditCommitmentButton from "./edit-commitment-button";

const IDS_LABELS: Record<string, { label: string; color: string }> = {
  identify: { label: "Identify", color: "bg-yellow-100 text-yellow-800" },
  discuss: { label: "Discuss", color: "bg-blue-100 text-blue-800" },
  solve: { label: "Solve", color: "bg-purple-100 text-purple-800" },
  resolved: { label: "Resuelto", color: "bg-emerald-100 text-emerald-800" },
};

export default async function L10Page() {
  const session = await auth();
  const activeQuarter = await prisma.quarter.findFirst({ where: { isActive: true } });

  if (!activeQuarter) {
    return <div className="py-12 text-center text-gray-500">No hay trimestre activo.</div>;
  }

  const meeting = await prisma.l10Meeting.findFirst({
    where: { quarterId: activeQuarter.id },
    orderBy: { date: "desc" },
    include: {
      issues: { include: { raisedBy: true, owner: true }, orderBy: { createdAt: "asc" } },
      commitments: { include: { owner: true }, orderBy: { createdAt: "asc" } },
    },
  });

  // 1. Recent wins (last 14 days) grouped by user
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentWins = await prisma.winChallenge.findMany({
    where: { quarterId: activeQuarter.id, entryType: "win", reportDate: { gte: twoWeeksAgo } },
    include: { user: true },
    orderBy: [{ user: { name: "asc" } }, { reportDate: "desc" }],
  });

  // 2. Red scorecards grouped by owner
  const allMetrics = await prisma.scorecardMetric.findMany({
    where: { isActive: true },
    include: { owner: true, entries: { orderBy: { periodStart: "desc" }, take: 1 } },
    orderBy: [{ owner: { name: "asc" } }, { sortOrder: "asc" }],
  });
  const redMetrics = allMetrics.filter((m) => {
    const status = m.entries[0]?.status;
    return status === "off_track" || status === "riesgo";
  });

  // Group red metrics by owner
  const redByOwner: Record<string, typeof redMetrics> = {};
  for (const m of redMetrics) {
    const name = m.owner.name;
    if (!redByOwner[name]) redByOwner[name] = [];
    redByOwner[name].push(m);
  }

  // 3. Off-track rocks grouped by owner
  const offTrackRocks = await prisma.rock.findMany({
    where: { quarterId: activeQuarter.id, status: { in: ["off_track", "riesgo"] }, finalStatus: null },
    include: { owner: true },
    orderBy: [{ owner: { name: "asc" } }, { createdAt: "asc" }],
  });

  const rocksByOwner: Record<string, typeof offTrackRocks> = {};
  for (const r of offTrackRocks) {
    const name = r.owner.name;
    if (!rocksByOwner[name]) rocksByOwner[name] = [];
    rocksByOwner[name].push(r);
  }

  // 4. Recent challenges
  const recentChallenges = await prisma.winChallenge.findMany({
    where: { quarterId: activeQuarter.id, entryType: "challenge", reportDate: { gte: twoWeeksAgo } },
    include: { user: true },
    orderBy: [{ user: { name: "asc" } }, { reportDate: "desc" }],
  });

  // Group wins by user
  const winsByUser: Record<string, typeof recentWins> = {};
  for (const w of recentWins) {
    const name = w.user.name;
    if (!winsByUser[name]) winsByUser[name] = [];
    winsByUser[name].push(w);
  }

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">L10 Meeting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Preparación bisemanal — Q{activeQuarter.quarter} {activeQuarter.year}
          </p>
        </div>
        {session?.user?.role === "ceo" && <CreateMeetingButton quarterId={activeQuarter.id} />}
      </div>

      {meeting && (
        <div className="rounded-lg bg-mawi-50 px-4 py-2 text-sm text-mawi-700">
          Reunión activa: {new Date(meeting.date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
          <span className="ml-2 rounded-full bg-mawi-100 px-2 py-0.5 text-xs font-medium capitalize">{meeting.status}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Column 1 */}
        <div className="space-y-6">
          {/* 1. Wins — grouped by person */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">1</div>
                <h2 className="text-sm font-semibold text-gray-900">Wins</h2>
                <span className="text-xs text-gray-400">10 min — 1 win por líder</span>
              </div>
            </div>
            <div className="px-5">
              {Object.keys(winsByUser).length === 0 ? (
                <p className="py-4 text-sm text-gray-400">Sin wins registrados en las últimas 2 semanas</p>
              ) : (
                Object.entries(winsByUser).map(([userName, wins]) => (
                  <div key={userName} className="border-b border-gray-50 py-3 last:border-0">
                    <div className="mb-1 text-xs font-semibold text-mawi-700">{userName}</div>
                    {wins.map((w) => (
                      <div key={w.id} className="mt-1.5">
                        <p className="text-sm text-gray-700">{w.wins}</p>
                        {w.result && <p className="mt-0.5 text-xs font-medium text-emerald-600">{w.result}</p>}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 2. Scorecard Rojos — grouped by person */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">2</div>
                <h2 className="text-sm font-semibold text-gray-900">Scorecard — Solo rojos</h2>
                <span className="text-xs text-gray-400">10 min</span>
              </div>
            </div>
            <div className="px-5">
              {Object.keys(redByOwner).length === 0 ? (
                <p className="py-4 text-sm text-emerald-600">Todas las métricas en verde</p>
              ) : (
                Object.entries(redByOwner).map(([ownerName, metrics]) => (
                  <div key={ownerName} className="border-b border-gray-50 py-3 last:border-0">
                    <div className="mb-2 text-xs font-semibold text-mawi-700">{ownerName}</div>
                    {metrics.map((m) => {
                      const entry = m.entries[0];
                      const cfg = STATUS_CONFIG[entry?.status || "pending"];
                      return (
                        <div key={m.id} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-gray-900">{m.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">{entry?.actualDisplay || entry?.actualValue || "—"}</span>
                            <span className="text-xs text-gray-400">/ {m.targetValue}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                            {entry?.updatedAt && (
                              <span className="text-[10px] text-gray-300">
                                {new Date(entry.updatedAt).toLocaleDateString("es", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 3. Rocks Off Track — grouped by person */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">3</div>
                <h2 className="text-sm font-semibold text-gray-900">Rocks — Solo Off Track</h2>
                <span className="text-xs text-gray-400">10 min</span>
              </div>
            </div>
            <div className="px-5">
              {Object.keys(rocksByOwner).length === 0 ? (
                <p className="py-4 text-sm text-emerald-600">Todos los rocks on track</p>
              ) : (
                Object.entries(rocksByOwner).map(([ownerName, rocks]) => (
                  <div key={ownerName} className="border-b border-gray-50 py-3 last:border-0">
                    <div className="mb-2 text-xs font-semibold text-mawi-700">{ownerName}</div>
                    {rocks.map((r) => {
                      const cfg = STATUS_CONFIG[r.status];
                      return (
                        <div key={r.id} className="py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-900">{r.title}</span>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                              <span className="text-[10px] text-gray-300">
                                {new Date(r.updatedAt).toLocaleDateString("es", { day: "numeric", month: "short" })}
                              </span>
                            </div>
                          </div>
                          {r.risk && <p className="mt-0.5 text-xs text-amber-600">Riesgo: {r.risk}</p>}
                          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${r.progress}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Column 2 */}
        <div className="space-y-6">
          {/* 4. Issues — IDS */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-mawi-100 text-xs font-bold text-mawi-700">4</div>
                  <h2 className="text-sm font-semibold text-gray-900">Issues — IDS</h2>
                  <span className="text-xs text-gray-400">50 min</span>
                </div>
                {meeting && <AddIssueButton meetingId={meeting.id} users={users} />}
              </div>
            </div>
            <div className="px-5">
              {recentChallenges.length > 0 && (
                <div className="border-b border-gray-100 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pre-work (challenges recientes)</div>
                  {recentChallenges.map((c) => (
                    <div key={c.id} className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs">
                      <span className="font-medium text-gray-900">{c.user.name}:</span>{" "}
                      <span className="text-gray-700">{c.keyChallenge}</span>
                      {c.followUpAction && <div className="mt-1 text-amber-700">Action: {c.followUpAction}</div>}
                    </div>
                  ))}
                </div>
              )}

              {!meeting ? (
                <p className="py-4 text-sm text-gray-400">Crea una reunión para agregar issues</p>
              ) : meeting.issues.length === 0 ? (
                <p className="py-4 text-sm text-gray-400">Sin issues. Agrega uno para empezar IDS.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {meeting.issues.map((issue) => {
                    const idsCfg = IDS_LABELS[issue.idsStatus] || IDS_LABELS.identify;
                    const priCfg = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medio;
                    return (
                      <div key={issue.id} className={`py-3 ${issue.idsStatus === "resolved" ? "opacity-60" : ""}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">{issue.title}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priCfg.className}`}>{priCfg.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${idsCfg.color}`}>{idsCfg.label}</span>
                          </div>
                        </div>
                        {issue.description && <p className="mt-1 text-xs text-gray-500">{issue.description}</p>}
                        <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                          <div>
                            Planteado por {issue.raisedBy.name}
                            {issue.owner && <span> · Owner: <span className="font-medium text-gray-600">{issue.owner.name}</span></span>}
                            {issue.dueDate && <span> · Para: {new Date(issue.dueDate).toLocaleDateString("es", { day: "numeric", month: "short" })}</span>}
                          </div>
                          {(issue.raisedById === session?.user?.id || session?.user?.role === "ceo") && (
                            <EditIssueButton
                              issueId={issue.id}
                              currentTitle={issue.title}
                              currentDescription={issue.description || ""}
                              currentPriority={issue.priority}
                            />
                          )}
                        </div>
                        {issue.resolution && (
                          <div className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                            Resolución: {issue.resolution}
                          </div>
                        )}
                        {issue.idsStatus !== "resolved" && (
                          <div className="mt-2">
                            <ResolveIssueButton issueId={issue.id} currentStatus={issue.idsStatus} users={users} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* 5. Compromisos */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700">5</div>
                  <h2 className="text-sm font-semibold text-gray-900">Compromisos</h2>
                  <span className="text-xs text-gray-400">3–5 min</span>
                </div>
                {meeting && <AddCommitmentButton meetingId={meeting.id} users={users} />}
              </div>
            </div>
            <div className="divide-y divide-gray-50 px-5">
              {!meeting || meeting.commitments.length === 0 ? (
                <p className="py-4 text-sm text-gray-400">Sin compromisos todavía</p>
              ) : (
                meeting.commitments.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-3">
                    <ToggleCommitmentButton commitmentId={c.id} done={c.done} />
                    <div className={c.done ? "flex-1 line-through opacity-50" : "flex-1"}>
                      <span className="text-sm text-gray-900">{c.action}</span>
                      <span className="ml-2 text-xs font-medium text-mawi-600">{c.owner.name}</span>
                      <span className="ml-1 text-xs text-gray-400">
                        — {new Date(c.dueDate).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {(c.ownerId === session?.user?.id || session?.user?.role === "ceo") && (
                      <EditCommitmentButton
                        commitmentId={c.id}
                        currentAction={c.action}
                        currentOwnerId={c.ownerId}
                        currentDueDate={new Date(c.dueDate).toISOString().split("T")[0]}
                        users={users}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
