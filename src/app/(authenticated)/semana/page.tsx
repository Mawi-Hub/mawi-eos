import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canManageMeetings } from "@/lib/l10Permissions";
import { checkinPeriodStart, crIsoDate, formatCrDateTime } from "@/lib/time/costaRica";
import { periodFromIso, weekParticipation } from "@/lib/checkin/teamCheckin";
import { weekLabel } from "@/lib/checkin/teamForm";
import { PREVIOUS_STATUS_LABEL, teamConfig } from "@/lib/checkin/teams";
import { loadWeek, weeklyChannel } from "@/lib/weekly/summary";
import { CheckinToggles, ManagementToggle } from "./checkin-toggles";
import { SummaryEditor } from "./summary-editor";

const DAY_MS = 24 * 60 * 60 * 1000;

const PREV_STYLE: Record<string, string> = {
  done: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  not_done: "bg-red-50 text-red-700",
};

export default async function SemanaPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  const now = new Date();
  // Por defecto, la semana del último jueves (el lunes a miércoles se sigue
  // viendo la semana anterior, que es la que se está cerrando).
  const period = (params.w && periodFromIso(params.w)) || checkinPeriodStart(now);
  const week = crIsoDate(period);
  const prev = crIsoDate(new Date(period.getTime() - 7 * DAY_MS));
  const next = crIsoDate(new Date(period.getTime() + 7 * DAY_MS));
  const isCurrent = period.getTime() >= checkinPeriodStart(now).getTime();

  const [canManage, participation, loaded, summary] = await Promise.all([
    canManageMeetings(session?.user),
    weekParticipation(period, now),
    loadWeek(period, { now }),
    prisma.weeklySummary.findUnique({ where: { periodStart: period } }),
  ]);
  const { answers, members, pending } = participation;
  const areas = loaded.data.areas;

  // Respuestas agrupadas por área, en el orden de las áreas.
  const groups = areas
    .map((a) => ({ key: a.key, name: a.name, rock: a.rock, rows: answers.filter((r) => r.areaKey === a.key) }))
    .filter((g) => g.rows.length > 0);
  const orphans = answers.filter((r) => !r.areaKey || !areas.some((a) => a.key === r.areaKey));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Semana del {weekLabel(period)}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Check-in del equipo, lo que validaron los managers y el resumen para #weekly-check-ins.
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium">
          <Link href={`/semana?w=${prev}`} className="rounded-md px-3 py-1.5 text-gray-500 hover:text-gray-900">
            ← Anterior
          </Link>
          {!isCurrent && (
            <Link href={`/semana?w=${next}`} className="rounded-md px-3 py-1.5 text-gray-500 hover:text-gray-900">
              Siguiente →
            </Link>
          )}
        </div>
      </div>

      {/* Participación */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="text-3xl font-semibold text-gray-900">{answers.length}</span>
            <span className="text-lg text-gray-400">/{Math.max(members.length, answers.length)}</span>
            <span className="ml-2 text-sm text-gray-500">respondieron</span>
          </div>
          {members.length === 0 && (
            <span className="text-sm text-amber-700">
              Nadie tiene equipo asignado todavía: cargá el roster (equipo + Slack) para que llegue el check-in.
            </span>
          )}
        </div>
        {pending.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-xs text-gray-400">Faltan:</span>
            {pending.map((m) => (
              <span key={m.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {m.displayName} · {m.team.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Respuestas */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Respuestas por área</h2>
        {answers.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Todavía no hay respuestas. El check-in sale el jueves a las 15:00 y se recuerda el viernes a las 8:00.
          </div>
        )}
        {[...groups, ...(orphans.length ? [{ key: "_otros", name: "Sin área", rock: null, rows: orphans }] : [])].map((g) => (
          <div key={g.key} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold text-gray-900">{g.name}</h3>
              {g.rock && <span className="truncate text-xs text-gray-400">Rock: {g.rock.title}</span>}
            </div>
            {g.rows.map((r) => {
              const team = teamConfig(r.teamKey);
              const numbers = (Array.isArray(r.numbers) ? (r.numbers as Array<{ label: string; value: number | null }>) : []).filter((n) => n.value !== null);
              return (
                <article key={r.id} className={`rounded-xl border bg-white p-5 ${r.hidden ? "border-gray-200 opacity-60" : r.highlighted ? "border-amber-300" : "border-gray-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-900">{r.authorName}</div>
                      <div className="text-xs text-gray-400">
                        {team?.name ?? r.teamKey} · {formatCrDateTime(r.submittedAt)}
                      </div>
                    </div>
                    {canManage && <CheckinToggles checkinId={r.id} hidden={r.hidden} highlighted={r.highlighted} />}
                  </div>
                  <dl className="mt-3 space-y-2.5 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-gray-400">Resultado</dt>
                      <dd className="whitespace-pre-wrap text-gray-800">{r.result}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-400">Aprendizaje</dt>
                      <dd className="whitespace-pre-wrap text-gray-800">{r.learning}</dd>
                    </div>
                    {r.extra && (
                      <div>
                        <dt className="text-xs font-medium text-gray-400">{team?.extra ?? "Otro"}</dt>
                        <dd className="whitespace-pre-wrap text-gray-800">{r.extra}</dd>
                      </div>
                    )}
                    {numbers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {numbers.map((n) => (
                          <span key={n.label} className="rounded-md bg-mawi-50 px-2 py-0.5 text-xs text-mawi-800">
                            {n.label}: <strong>{n.value}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                    {r.blocker && (
                      <div className="rounded-lg bg-red-50 px-3 py-2">
                        <dt className="text-xs font-medium text-red-700">Bloqueo / ayuda</dt>
                        <dd className="whitespace-pre-wrap text-red-900">{r.blocker}</dd>
                      </div>
                    )}
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-gray-100 pt-2.5">
                      <div className="min-w-0 flex-1">
                        <dt className="text-xs font-medium text-gray-400">Compromiso próxima semana</dt>
                        <dd className="text-gray-800">{r.commitment}</dd>
                      </div>
                      {r.previousCommitment && (
                        <div className="min-w-0 flex-1">
                          <dt className="text-xs font-medium text-gray-400">Compromiso anterior</dt>
                          <dd className="text-gray-600">
                            {r.previousCommitmentStatus && (
                              <span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PREV_STYLE[r.previousCommitmentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                                {PREVIOUS_STATUS_LABEL[r.previousCommitmentStatus] ?? r.previousCommitmentStatus}
                              </span>
                            )}
                            {r.previousCommitment}
                          </dd>
                        </div>
                      )}
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ))}
      </section>

      {/* Management */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Management</h2>
        {loaded.meetingId ? (
          loaded.managementCandidates.length ? (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {loaded.managementCandidates.map((c) => (
                <div key={c.key} className={`flex items-start justify-between gap-3 px-5 py-3 text-sm ${c.hidden ? "opacity-60" : ""}`}>
                  <div>
                    <span className="mr-2 text-xs text-gray-400">{c.kind === "commitment" ? "Acuerdo" : "Decisión"}</span>
                    <span className="text-gray-800">{c.label}</span>
                  </div>
                  {canManage && <ManagementToggle week={week} itemKey={c.key} hidden={c.hidden} />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">La reunión de esta semana no dejó acuerdos ni decisiones compartibles (se eligen al cerrarla).</p>
          )
        ) : (
          <p className="text-sm text-gray-500">
            Esta semana no se cerró una reunión de management. El resumen sale igual con los Rocks y lo que respondió el equipo.
          </p>
        )}
        <p className="text-xs text-gray-400">
          Los IDS y challenges de management nunca se publican; solo entran los acuerdos y el resumen compartible que se aprueban al cerrar la L10.
        </p>
      </section>

      {/* Resumen */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Resumen para #weekly-check-ins</h2>
        <SummaryEditor
          key={`${week}:${summary?.generatedAt?.toISOString() ?? ""}:${summary?.editedAt?.toISOString() ?? ""}:${summary?.status ?? ""}`}
          week={week}
          initialText={summary?.draftText ?? null}
          status={summary?.status ?? "draft"}
          canManage={canManage}
          channelConfigured={!!weeklyChannel()}
          permalink={summary?.permalink ?? null}
          sentAt={summary?.sentAt ? formatCrDateTime(summary.sentAt) : null}
          lastError={summary?.lastError ?? null}
          edited={!!summary?.editedAt}
        />
      </section>
    </div>
  );
}
