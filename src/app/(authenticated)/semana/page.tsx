import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canManageMeetings } from "@/lib/l10Permissions";
import { isLeaderRole } from "@/lib/access";
import { THREAD_MARKER } from "@/lib/weekly/render";
import { checkinPeriodStart, crIsoDate, formatCrDateTime } from "@/lib/time/costaRica";
import { periodFromIso, weekParticipation } from "@/lib/checkin/teamCheckin";
import { weekLabel } from "@/lib/checkin/teamForm";
import { rockStatus } from "@/lib/company/areas";
import { loadWeek, weeklyChannel } from "@/lib/weekly/summary";
import { ENERGY_MIN_SAMPLE } from "@/lib/weekly/render";
import { CheckinCard } from "./checkin-card";
import { ManagementToggle } from "./checkin-toggles";
import { SummaryEditor } from "./summary-editor";

const DAY_MS = 24 * 60 * 60 * 1000;

// Texto de Slack a texto simple para la vista del equipo (sin asteriscos ni guiones bajos de formato).
function slackToPlain(text: string): string {
  return text
    .trim()
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2");
}

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

  // El equipo ve lo publicado y la participación; las respuestas individuales,
  // los bloqueos y el borrador son solo para managers.
  if (!isLeaderRole(session?.user?.role)) {
    const published = summary?.status === "sent" && summary.draftText ? summary.draftText.split(THREAD_MARKER) : null;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Semana del {weekLabel(period)}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Respondieron {answers.length} de {Math.max(members.length, answers.length)} personas el check-in.
            </p>
          </div>
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium">
            <Link href={`/semana?w=${prev}`} className="rounded-md px-3 py-1.5 text-gray-500 hover:text-gray-900">← Anterior</Link>
            {!isCurrent && <Link href={`/semana?w=${next}`} className="rounded-md px-3 py-1.5 text-gray-500 hover:text-gray-900">Siguiente →</Link>}
          </div>
        </div>
        {published ? (
          <div className="space-y-3">
            <article className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-white p-5 text-sm leading-relaxed text-gray-800">{slackToPlain(published[0])}</article>
            {published[1]?.trim() && (
              <article className="whitespace-pre-wrap rounded-xl border border-dashed border-gray-200 bg-white p-5 text-sm leading-relaxed text-gray-700">{slackToPlain(published[1])}</article>
            )}
            {summary?.permalink && (
              <a href={summary.permalink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-mawi-700 underline">Ver en #weekly-check-ins</a>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            El resumen de esta semana se publica el viernes en #weekly-check-ins.
          </div>
        )}
      </div>
    );
  }

  // Respuestas agrupadas por área, en el orden de las áreas.
  const groups = areas
    .map((a) => ({ key: a.key, name: a.name, leaderName: a.leaderName, rock: a.rock, rows: answers.filter((r) => r.areaKey === a.key) }))
    .filter((g) => g.rows.length > 0);
  const orphans = answers.filter((r) => !r.areaKey || !areas.some((a) => a.key === r.areaKey));
  const sections = [...groups, ...(orphans.length ? [{ key: "_otros", name: "Sin área", leaderName: null, rock: null, rows: orphans }] : [])];

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
          {loaded.data.energy && loaded.data.energy.count >= ENERGY_MIN_SAMPLE && (
            <div title="Promedio de quienes respondieron. No se muestra el número de nadie.">
              <span className="text-3xl font-semibold text-gray-900">{String(loaded.data.energy.average).replace(".", ",")}</span>
              <span className="text-lg text-gray-400">/5</span>
              <span className="ml-2 text-sm text-gray-500">energía del equipo</span>
              {loaded.data.energy.low > 0 && (
                <span className="ml-3 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                  {loaded.data.energy.low} persona{loaded.data.energy.low === 1 ? "" : "s"} en 1–2: puede servir preguntar qué apoyo necesitan
                </span>
              )}
            </div>
          )}
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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Respuestas por área</h2>
          {sections.length > 1 && (
            <nav className="flex flex-wrap gap-1.5" aria-label="Ir a un área">
              {sections.map((g) => (
                <a key={g.key} href={`#area-${g.key}`} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-mawi-300 hover:text-mawi-700">
                  {g.name} <span className="text-gray-400">{g.rows.length}</span>
                </a>
              ))}
            </nav>
          )}
        </div>
        {answers.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Todavía no hay respuestas. El check-in sale el jueves a las 15:00 y se recuerda el viernes a las 8:00.
          </div>
        )}
        {sections.map((g) => {
          const st = g.rock ? rockStatus(g.rock.status) : null;
          return (
            <div key={g.key} id={`area-${g.key}`} className="scroll-mt-6 space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 pb-2">
                <h3 className="font-semibold text-gray-900">{g.name}</h3>
                {g.leaderName && <span className="text-xs text-gray-400">{g.leaderName}</span>}
                {g.rock && (
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                    <span className="text-gray-400">Rock:</span>
                    <span className="min-w-0 break-words">{g.rock.title}</span>
                    {st && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.badge}`}>{st.label}</span>}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {g.rows.map((r) => (
                  <CheckinCard key={r.id} checkin={r} canManage={canManage} />
                ))}
              </div>
            </div>
          );
        })}
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
