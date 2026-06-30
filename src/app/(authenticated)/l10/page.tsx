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
import CloseMeetingButton from "./close-meeting-button";
import { MarkAsReadButton } from "./mark-as-read-button";
import { VoteButton } from "./vote-button";
import { StartMeetingButton } from "./start-meeting-button";
import { PreReadChecklist } from "./preread-checklist";
import { DeleteIssueButton } from "./delete-issue-button";

export default async function L10Page() {
  const session = await auth();
  const activeQuarter = await prisma.quarter.findFirst({ where: { isActive: true } });

  if (!activeQuarter) {
    return <div className="py-12 text-center text-gray-500">No hay trimestre activo.</div>;
  }

  // Fan out the independent reads in parallel so we hold fewer connections overall
  const [meeting, pastMeetings, allMetrics, allActiveRocks, users] = await Promise.all([
    prisma.l10Meeting.findFirst({
      where: { quarterId: activeQuarter.id, status: { not: "completed" } },
      orderBy: { date: "desc" },
      include: {
        issues: {
          include: {
            raisedBy: true,
            owner: true,
            linkedRock: { select: { id: true, title: true } },
            linkedMetric: { select: { id: true, name: true } },
            votes: { select: { userId: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        commitments: { include: { owner: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.l10Meeting.findMany({
      where: { quarterId: activeQuarter.id, status: "completed" },
      orderBy: { date: "desc" },
      include: {
        _count: { select: { issues: true, commitments: true } },
        issues: { include: { owner: true }, where: { idsStatus: "resolved" }, orderBy: { createdAt: "asc" } },
        commitments: { include: { owner: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.scorecardMetric.findMany({
      where: { isActive: true },
      include: { owner: true, entries: { orderBy: { periodStart: "desc" }, take: 5 } },
      orderBy: [{ owner: { name: "asc" } }, { sortOrder: "asc" }],
    }),
    prisma.rock.findMany({
      where: { quarterId: activeQuarter.id, finalStatus: null },
      include: { owner: true },
      orderBy: [{ owner: { name: "asc" } }, { createdAt: "asc" }],
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Derive red metrics and off-track rocks from the bulk fetches above
  const redMetrics = allMetrics.filter((m) => {
    const status = m.entries[0]?.status;
    return status === "off_track" || status === "riesgo";
  });
  const offTrackRocks = allActiveRocks.filter((r) => r.status === "off_track" || r.status === "riesgo");

  // Cycle cutoff = when the last meeting was closed (falls back to 7 days ago — weekly cadence)
  const lastClosedMeeting = pastMeetings[0];
  const cycleStart = lastClosedMeeting
    ? new Date(lastClosedMeeting.updatedAt)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // "Weeks red" streak per metric: count leading entries that are off_track/riesgo
  const redStreakByMetric = new Map<string, number>();
  for (const m of redMetrics) {
    let streak = 0;
    for (const e of m.entries) {
      if (e.status === "off_track" || e.status === "riesgo") streak++;
      else break;
    }
    redStreakByMetric.set(m.id, streak);
  }
  const CHRONIC_RED_THRESHOLD = 4;

  // Second wave: queries that depend on meeting/cycleStart. Parallel again.
  const [recentWins, preReadReads, openCommitments] = await Promise.all([
    prisma.winChallenge.findMany({
      where: { quarterId: activeQuarter.id, entryType: "win", reportDate: { gte: cycleStart } },
      include: { user: true },
      orderBy: [{ user: { name: "asc" } }, { reportDate: "desc" }],
    }),
    meeting
      ? prisma.l10PreReadRead.findMany({
          where: { meetingId: meeting.id },
          select: { userId: true },
        })
      : Promise.resolve([] as Array<{ userId: string }>),
    // Open commitments from PAST meetings — persistent accountability across reus
    prisma.l10Commitment.findMany({
      where: {
        done: false,
        meeting: { quarterId: activeQuarter.id },
        ...(meeting ? { meetingId: { not: meeting.id } } : {}),
      },
      include: {
        owner: { select: { id: true, name: true } },
        meeting: { select: { date: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  // Cobertura: cada rojo/off-track se considera "amarrado" si existe al menos
  // un issue de la reunión activa vinculado a esa métrica o rock. No hay un
  // modelo de cobertura aparte — el owner amarra creando un IDS.
  const issuesByMetric = new Map<string, Array<{ id: string; title: string }>>();
  const issuesByRock = new Map<string, Array<{ id: string; title: string }>>();
  if (meeting) {
    for (const iss of meeting.issues) {
      if (iss.linkedMetricId) {
        const arr = issuesByMetric.get(iss.linkedMetricId) || [];
        arr.push({ id: iss.id, title: iss.title });
        issuesByMetric.set(iss.linkedMetricId, arr);
      }
      if (iss.linkedRockId) {
        const arr = issuesByRock.get(iss.linkedRockId) || [];
        arr.push({ id: iss.id, title: iss.title });
        issuesByRock.set(iss.linkedRockId, arr);
      }
    }
  }

  const coverageRows: Array<{
    key: string;
    sourceType: "metric" | "rock";
    sourceId: string;
    ownerId: string;
    label: string;
    ownerName: string;
    statusBadge: { label: string; className: string };
    linkedIssues: Array<{ id: string; title: string }>;
    chronicWeeks: number | null;
  }> = [];
  for (const m of redMetrics) {
    const entry = m.entries[0];
    const cfg = STATUS_CONFIG[entry?.status || "pending"];
    const streak = redStreakByMetric.get(m.id) || 0;
    coverageRows.push({
      key: `metric:${m.id}`,
      sourceType: "metric",
      sourceId: m.id,
      ownerId: m.ownerId,
      label: m.name,
      ownerName: m.owner.name,
      statusBadge: cfg,
      linkedIssues: issuesByMetric.get(m.id) || [],
      chronicWeeks: streak >= CHRONIC_RED_THRESHOLD ? streak : null,
    });
  }
  for (const r of offTrackRocks) {
    const cfg = STATUS_CONFIG[r.status];
    coverageRows.push({
      key: `rock:${r.id}`,
      sourceType: "rock",
      sourceId: r.id,
      ownerId: r.ownerId,
      label: r.title,
      ownerName: r.owner.name,
      statusBadge: cfg,
      linkedIssues: issuesByRock.get(r.id) || [],
      chronicWeeks: null,
    });
  }
  const orphanCount = coverageRows.filter((r) => r.linkedIssues.length === 0).length;

  // Group wins by user
  const winsByUser: Record<string, typeof recentWins> = {};
  for (const w of recentWins) {
    const name = w.user.name;
    if (!winsByUser[name]) winsByUser[name] = [];
    winsByUser[name].push(w);
  }

  // Issue link selector options — only the current user's own rocks and metrics
  const rockOptions = session?.user?.id
    ? allActiveRocks.filter((r) => r.ownerId === session.user!.id).map((r) => ({ id: r.id, title: r.title }))
    : [];
  const metricOptions = session?.user?.id
    ? allMetrics.filter((m) => m.ownerId === session.user!.id).map((m) => ({ id: m.id, name: m.name }))
    : [];

  // How many issues current user has already raised in this meeting
  const userIssueCount = meeting && session?.user?.id
    ? meeting.issues.filter((i) => i.raisedById === session.user!.id).length
    : 0;
  const remainingIssues = Math.max(0, 3 - userIssueCount);

  // Sort issues by vote count desc — votes are the priority signal whenever there are any
  const sortedIssues = meeting
    ? [...meeting.issues].sort((a, b) => b.votes.length - a.votes.length)
    : [];

  // Pre-read read tracking + annotations indexes
  const readUserIds = new Set(preReadReads.map((r) => r.userId));
  const currentUserRead = session?.user?.id ? readUserIds.has(session.user.id) : false;

  const isCeo = session?.user?.role === "ceo";
  const currentUserId = session?.user?.id || "";
  const currentUser = users.find((u) => u.id === currentUserId);

  // Per-user readiness for the meeting header. A user is "listo" when every
  // applicable pre-read item is done for them. Items only count if relevant
  // (a user with no rocks doesn't need to "review rocks").
  function isUserReady(userId: string): boolean {
    if (!meeting) return false;
    const hasWin = recentWins.some((w) => w.userId === userId);
    if (!hasWin) return false;

    const userManualMetrics = allMetrics.filter((m) => m.ownerId === userId && m.dataSource === "manual");
    const userMetricsOk = userManualMetrics.every((m) => {
      const last = m.entries[0];
      return last && new Date(last.periodStart) >= cycleStart;
    });
    if (!userMetricsOk) return false;

    const userRocks = allActiveRocks.filter((r) => r.ownerId === userId);
    const userRocksOk = userRocks.every((r) => new Date(r.updatedAt) >= cycleStart);
    if (!userRocksOk) return false;

    if (!readUserIds.has(userId)) return false;
    return true;
  }
  const readinessByUser = new Map(users.map((u) => [u.id, isUserReady(u.id)] as const));
  const readyCount = Array.from(readinessByUser.values()).filter(Boolean).length;

  // Sections the user must confirm before marking the pre-read leído
  const readSections: Array<{ key: string; label: string }> = [];
  if (recentWins.length > 0) readSections.push({ key: "wins", label: `Leí los ${recentWins.length} wins de la semana` });
  if (coverageRows.length > 0) readSections.push({ key: "cobertura", label: `Revisé las ${coverageRows.length} métricas/rocks en cobertura` });
  if (meeting && meeting.issues.length > 0) readSections.push({ key: "ids", label: `Leí los ${meeting.issues.length} IDS propuestos` });
  if (openCommitments.length > 0) readSections.push({ key: "commits", label: `Revisé los ${openCommitments.length} compromisos pendientes` });
  if (readSections.length === 0) readSections.push({ key: "noop", label: "Confirmo que el pre-read está vacío y no hay nada que leer" });

  const inMeeting = meeting?.status === "in_progress";

  // Build pre-read checklist scoped to the current user
  type ChecklistItem = { key: string; label: string; done: boolean; hint?: string; link?: { href: string; label: string } };
  const checklistItems: ChecklistItem[] = [];
  if (meeting && currentUser) {
    const myWins = recentWins.filter((w) => w.userId === currentUserId);
    // Only manual metrics need human updates; autocalculated ones (chartmogul, hubspot, posthog) sync on their own
    const myManualMetrics = allMetrics.filter((m) => m.ownerId === currentUserId && m.dataSource === "manual");
    const myMetricsUpdated = myManualMetrics.filter((m) => {
      const last = m.entries[0];
      return last && new Date(last.periodStart) >= cycleStart;
    }).length;
    const myRocks = allActiveRocks.filter((r) => r.ownerId === currentUserId);
    const myRocksReviewed = myRocks.filter((r) => new Date(r.updatedAt) >= cycleStart).length;
    const myIssueCount = meeting.issues.filter((i) => i.raisedById === currentUserId).length;

    checklistItems.push({
      key: "win",
      label: "Win de la semana",
      done: myWins.length > 0,
      link: myWins.length === 0 ? { href: "/wins-challenges", label: "Agregar →" } : undefined,
    });
    if (myManualMetrics.length > 0) {
      checklistItems.push({
        key: "metrics",
        label: `Métricas manuales actualizadas (${myMetricsUpdated}/${myManualMetrics.length})`,
        done: myMetricsUpdated === myManualMetrics.length,
        link: myMetricsUpdated < myManualMetrics.length ? { href: "/scorecard", label: "Ir →" } : undefined,
      });
    }
    if (myRocks.length > 0) {
      checklistItems.push({
        key: "rocks",
        label: `Rocks revisados (${myRocksReviewed}/${myRocks.length})`,
        done: myRocksReviewed === myRocks.length,
        link: myRocksReviewed < myRocks.length ? { href: "/rocks", label: "Ir →" } : undefined,
      });
    }
    checklistItems.push({
      key: "ids",
      label: `IDS enviados (${myIssueCount}/3)`,
      done: myIssueCount > 0,
      hint: myIssueCount === 0 ? "agregá al menos uno si tenés tema" : undefined,
    });
    checklistItems.push({
      key: "read",
      label: "Pre-read marcado leído",
      done: currentUserRead,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">L10 Meeting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Preparación semanal — Q{activeQuarter.quarter} {activeQuarter.year}
          </p>
        </div>
        {session?.user?.role === "ceo" && <CreateMeetingButton quarterId={activeQuarter.id} />}
      </div>

      {meeting && currentUser && checklistItems.length > 0 && (
        <PreReadChecklist userName={currentUser.name} items={checklistItems} />
      )}

      {meeting && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg bg-mawi-50 px-5 py-3">
          {/* Left: meeting label + listos pills */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="text-sm font-medium text-mawi-800">
              Reunión {new Date(meeting.date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-mawi-600">
                Listos {readyCount}/{users.length}
              </span>
              {users.map((u) => {
                const ready = readinessByUser.get(u.id);
                return (
                  <span
                    key={u.id}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ready ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}
                    title={ready ? "Pre-read completo" : "Le falta algo"}
                  >
                    {ready ? "✓" : "•"} {u.name.split(" ")[0]}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meeting.status === "in_progress" ? "bg-mawi-800 text-white" : "bg-gray-200 text-gray-600"}`}>
              {meeting.status === "in_progress" ? "Abierta" : "Por empezar"}
            </span>
            <MarkAsReadButton meetingId={meeting.id} alreadyRead={currentUserRead} items={readSections} />
            {session?.user?.role === "ceo" && meeting.status === "upcoming" && (
              <StartMeetingButton meetingId={meeting.id} />
            )}
            {session?.user?.role === "ceo" && meeting.status === "in_progress" && (
              <CloseMeetingButton meetingId={meeting.id} currentNotes={meeting.notes || ""} isCompleted={false} />
            )}
          </div>
        </div>
      )}

      <div className={`mx-auto w-full space-y-6 ${inMeeting ? "max-w-5xl" : "max-w-3xl"}`}>
        {/* In-meeting banner */}
        {inMeeting && (
          <div className="rounded-lg border border-mawi-200 bg-mawi-50 px-4 py-2.5 text-sm text-mawi-800">
            Reunión en curso. El foco son los <strong>IDS</strong>. Pre-read (wins, cobertura) queda colapsado abajo.
          </div>
        )}

        {/* Compromisos abiertos de semanas previas — accountability across reus */}
        {openCommitments.length > 0 && (() => {
          const now = new Date();
          const overdue = openCommitments.filter((c) => new Date(c.dueDate) < now).length;
          return (
            <section className="rounded-lg border border-amber-200 bg-white">
              <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800">!</div>
                  <h2 className="text-sm font-semibold text-gray-900">Compromisos abiertos</h2>
                  <span className="text-xs text-amber-700">de semanas previas — cerralos antes de tomar nuevos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {overdue > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">{overdue} vencidos</span>
                  )}
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{openCommitments.length} abiertos</span>
                </div>
              </div>
              <div className="divide-y divide-gray-50 px-5">
                {openCommitments.map((c) => {
                  const due = new Date(c.dueDate);
                  const isOverdue = due < now;
                  const isMine = c.ownerId === currentUserId;
                  return (
                    <div key={c.id} className="flex items-center gap-3 py-2.5">
                      {(isMine || isCeo) ? (
                        <ToggleCommitmentButton commitmentId={c.id} done={c.done} />
                      ) : (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-200" />
                      )}
                      <div className="flex-1">
                        <span className="text-sm text-gray-900">{c.action}</span>
                        <span className="ml-2 text-xs font-medium text-mawi-600">{c.owner.name}</span>
                      </div>
                      <span className={`text-xs ${isOverdue ? "font-medium text-red-700" : "text-gray-500"}`}>
                        {isOverdue ? "Vencido " : "Vence "}
                        {due.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span className="text-[10px] text-gray-300" title={`Reunión del ${new Date(c.meeting.date).toLocaleDateString("es")}`}>
                        ·  {new Date(c.meeting.date).toLocaleDateString("es", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* === Reading order swaps based on inMeeting === */}

        {/* WINS — full when pre-read, collapsed when in meeting */}
        {!inMeeting && (
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">1</div>
                <h2 className="text-sm font-semibold text-gray-900">Wins de la semana</h2>
                <span className="text-xs text-gray-400">1 win por líder</span>
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
        )}

        {/* COBERTURA — full in pre-read, collapsed in meeting */}
        {!inMeeting && (
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">2</div>
                  <h2 className="text-sm font-semibold text-gray-900">Cobertura</h2>
                  <span className="text-xs text-gray-400">Pre-read · cada rojo / off-track debería tener un IDS</span>
                </div>
                {coverageRows.length > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${orphanCount > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {orphanCount > 0 ? `${orphanCount} sin amarrar` : "Todo amarrado"}
                  </span>
                )}
              </div>
            </div>
            <div className="px-5">
              {coverageRows.length === 0 ? (
                <p className="py-4 text-sm text-emerald-600">No hay rojos ni rocks off-track</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {coverageRows.map((row) => (
                    <div key={row.key} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                              {row.sourceType === "metric" ? "Métrica" : "Rock"}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.statusBadge.className}`}>
                              {row.statusBadge.label}
                            </span>
                            <span className="text-[10px] text-mawi-700">{row.ownerName}</span>
                            {row.chronicWeeks && (
                              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white" title="Métrica en rojo varias semanas seguidas">
                                ⚠ {row.chronicWeeks} sem en rojo
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-900">{row.label}</div>
                          {row.linkedIssues.length > 0 ? (
                            <div className="mt-1.5 space-y-1">
                              {row.linkedIssues.map((iss) => (
                                <div key={iss.id} className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
                                  <span className="font-medium text-mawi-700">→ IDS:</span> {iss.title}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1.5 text-xs text-amber-700">
                              Sin IDS vinculado — agregá uno o aclará en la reu
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ISSUES — protagonist */}
        <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-mawi-100 text-xs font-bold text-mawi-700">{inMeeting ? "1" : "3"}</div>
                  <h2 className="text-sm font-semibold text-gray-900">IDS de la semana</h2>
                  <span className="text-xs text-gray-400">{inMeeting ? "Discutí y resolvé por orden de votos" : "Cada líder propone hasta 3"}</span>
                </div>
                {meeting && (
                  <AddIssueButton
                    meetingId={meeting.id}
                    users={users}
                    rocks={rockOptions}
                    metrics={metricOptions}
                    remaining={remainingIssues}
                  />
                )}
              </div>
            </div>
            <div className="px-5">
              {!meeting ? (
                <p className="py-4 text-sm text-gray-400">Crea una reunión para agregar issues</p>
              ) : sortedIssues.length === 0 ? (
                <p className="py-4 text-sm text-gray-400">Sin issues. Agrega uno para empezar IDS.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sortedIssues.map((issue) => {
                    const priCfg = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medio;
                    const userVoted = issue.votes.some((v) => v.userId === currentUserId);
                    const voteDisabled = meeting.status === "completed";
                    const linkLabel = issue.linkedRock
                      ? `Rock · ${issue.linkedRock.title}`
                      : issue.linkedMetric
                        ? `Métrica · ${issue.linkedMetric.name}`
                        : null;
                    return (
                      <div key={issue.id} className={`py-3 ${issue.idsStatus === "resolved" ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-gray-900">{issue.title}</span>
                            {linkLabel && (
                              <div className="mt-0.5 text-[11px] text-mawi-600">↳ {linkLabel}</div>
                            )}
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-1.5">
                            <VoteButton issueId={issue.id} voted={userVoted} count={issue.votes.length} disabled={voteDisabled} />
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priCfg.className}`}>{priCfg.label}</span>
                            {issue.idsStatus === "resolved" && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">Resuelto</span>
                            )}
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
                            <div className="flex items-center gap-2">
                              <EditIssueButton
                                issueId={issue.id}
                                currentTitle={issue.title}
                                currentDescription={issue.description || ""}
                                currentPriority={issue.priority}
                              />
                              <span className="text-gray-300">·</span>
                              <DeleteIssueButton issueId={issue.id} />
                            </div>
                          )}
                        </div>
                        {issue.resolution && (
                          <div className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                            Resolución: {issue.resolution}
                          </div>
                        )}
                        {issue.idsStatus !== "resolved" && (
                          <div className="mt-2">
                            <ResolveIssueButton issueId={issue.id} users={users} />
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
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700">{inMeeting ? "2" : "4"}</div>
                  <h2 className="text-sm font-semibold text-gray-900">Compromisos</h2>
                  <span className="text-xs text-gray-400">Léelos en voz alta al cerrar</span>
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

        {/* In-meeting collapsed pre-read sections */}
        {inMeeting && (
          <>
            <details className="rounded-lg border border-gray-200 bg-white">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Wins de la semana ({recentWins.length})
              </summary>
              <div className="border-t border-gray-100 px-5 py-3">
                {Object.keys(winsByUser).length === 0 ? (
                  <p className="text-sm text-gray-400">Sin wins registrados</p>
                ) : (
                  Object.entries(winsByUser).map(([userName, wins]) => (
                    <div key={userName} className="border-b border-gray-50 py-2 last:border-0">
                      <div className="text-xs font-semibold text-mawi-700">{userName}</div>
                      {wins.map((w) => (
                        <div key={w.id} className="mt-1 text-sm text-gray-700">
                          {w.wins}
                          {w.result && <span className="ml-2 text-xs font-medium text-emerald-600">{w.result}</span>}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="rounded-lg border border-gray-200 bg-white">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cobertura ({coverageRows.length} {orphanCount > 0 ? `· ${orphanCount} sin IDS` : "· todo cubierto"})
              </summary>
              <div className="divide-y divide-gray-50 border-t border-gray-100 px-5">
                {coverageRows.length === 0 ? (
                  <p className="py-3 text-sm text-emerald-600">Sin rojos ni rocks off-track</p>
                ) : (
                  coverageRows.map((row) => (
                    <div key={row.key} className="py-2 text-sm">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {row.sourceType === "metric" ? "Métrica" : "Rock"}
                      </span>{" "}
                      <span className="text-gray-900">{row.label}</span>{" "}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${row.statusBadge.className}`}>{row.statusBadge.label}</span>{" "}
                      <span className="text-[10px] text-mawi-700">· {row.ownerName}</span>
                      {row.linkedIssues.length === 0 && (
                        <span className="ml-2 text-[11px] text-amber-700">· sin IDS</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </details>
          </>
        )}
      </div>

      {/* History */}
      {pastMeetings.length > 0 && (
        <div className="pt-4">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Histórico de reuniones</h2>
          <div className="space-y-4">
            {pastMeetings.map((pm) => (
              <details key={pm.id} className="rounded-lg border border-gray-200 bg-white">
                <summary className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {new Date(pm.date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {pm._count.issues} issues · {pm._count.commitments} compromisos
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Completada</span>
                    {session?.user?.role === "ceo" && (
                      <CloseMeetingButton meetingId={pm.id} currentNotes={pm.notes || ""} isCompleted={true} />
                    )}
                  </div>
                </summary>
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  {pm.notes && (
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Resumen de la reunión</div>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{pm.notes}</p>
                    </div>
                  )}

                  {pm.issues.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Issues resueltos</div>
                      <div className="space-y-2">
                        {pm.issues.map((iss) => (
                          <div key={iss.id} className="rounded-md bg-emerald-50 px-3 py-2 text-xs">
                            <div className="font-medium text-gray-900">{iss.title}</div>
                            {iss.resolution && <div className="mt-0.5 text-emerald-800">→ {iss.resolution}</div>}
                            {iss.owner && (
                              <div className="mt-0.5 text-gray-500">
                                {iss.owner.name}
                                {iss.dueDate && ` · ${new Date(iss.dueDate).toLocaleDateString("es", { day: "numeric", month: "short" })}`}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {pm.commitments.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Compromisos</div>
                      <div className="space-y-1">
                        {pm.commitments.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 text-xs">
                            <span className={`h-2 w-2 rounded-full ${c.done ? "bg-emerald-500" : "bg-gray-300"}`} />
                            <span className={c.done ? "text-gray-500 line-through" : "text-gray-900"}>{c.action}</span>
                            <span className="text-mawi-600 font-medium">· {c.owner.name}</span>
                            <span className="text-gray-400">· {new Date(c.dueDate).toLocaleDateString("es", { day: "numeric", month: "short" })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
