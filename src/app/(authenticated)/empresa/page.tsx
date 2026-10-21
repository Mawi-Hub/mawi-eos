import Link from "next/link";
import { prisma } from "@/lib/db";
import { quarterOverview, rockStatus } from "@/lib/company/areas";
import { northStars } from "@/lib/company/northStars";
import { checkinPeriodStart } from "@/lib/time/costaRica";
import { weekLabel } from "@/lib/checkin/teamForm";
import { ENERGY_MIN_SAMPLE, summarizeEnergy, THREAD_MARKER } from "@/lib/weekly/render";

export const dynamic = "force-dynamic";

const SIGNAL_STYLE = {
  on_track: { dot: "bg-emerald-500", text: "text-emerald-700", label: "en línea con el plan" },
  riesgo: { dot: "bg-amber-500", text: "text-amber-700", label: "cerca del plan" },
  off_track: { dot: "bg-red-500", text: "text-red-700", label: "por debajo del plan" },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

// Texto de Slack a texto simple.
function plain(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2")
    .trim();
}

// Cómo va Mawi: la vista de avance de la empresa para todo el equipo. Muestra
// solo lo agregado (métricas norte, Rocks y KPIs por área, el último resumen
// publicado y la energía promedio). Nada individual ni confidencial.
export default async function EmpresaPage() {
  const now = new Date();
  const thisWeek = checkinPeriodStart(now);
  const since = new Date(thisWeek.getTime() - 5 * 7 * DAY_MS);

  const [stars, overview, lastSummary, energyRows] = await Promise.all([
    northStars(now),
    quarterOverview(),
    prisma.weeklySummary.findFirst({ where: { status: "sent" }, orderBy: { periodStart: "desc" } }),
    prisma.teamCheckin.findMany({ where: { periodStart: { gte: since } }, select: { periodStart: true, energy: true } }),
  ]);

  const weeks = Array.from({ length: 6 }, (_, i) => new Date(thisWeek.getTime() - (5 - i) * 7 * DAY_MS));
  const energy = weeks.map((w) => ({
    week: w,
    summary: summarizeEnergy(energyRows.filter((r) => r.periodStart.getTime() === w.getTime()).map((r) => r.energy)),
  }));
  const hasEnergy = energy.some((e) => e.summary && e.summary.count >= ENERGY_MIN_SAMPLE);

  const q = overview.quarter;
  const rocks = overview.areas.flatMap((a) => a.rocks);
  const onTrack = rocks.filter((r) => r.status === "on_track" || r.status === "done").length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cómo va Mawi</h1>
        <p className="mt-1 text-sm text-gray-500">
          {q ? `Q${q.quarter} ${q.year}` : "Sin trimestre activo"}
          {rocks.length ? ` · ${onTrack} de ${rocks.length} Rocks en camino` : ""}
          {q?.objective ? ` · ${q.objective}` : ""}
        </p>
      </div>

      {/* Métricas norte */}
      {stars.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stars.map((s) => {
            const style = s.signal ? SIGNAL_STYLE[s.signal] : null;
            const max = Math.max(...s.trend.map((t) => t.value), 0);
            const min = Math.min(...s.trend.map((t) => t.value), max);
            return (
              <div key={s.slug} className="min-w-0 rounded-xl border border-gray-200 bg-white p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.name}</div>
                <div className="mt-1 text-3xl font-semibold text-gray-900">{s.valueText ?? "—"}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {s.periodLabel ? `${s.periodLabel} · ` : ""}plan del mes {s.planText ?? "—"}
                </div>
                {style && (
                  <div className={`mt-2 flex items-center gap-1.5 text-xs ${style.text}`}>
                    <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
                    {style.label}
                  </div>
                )}
                {s.trend.length > 1 && (
                  <div className="mt-3 flex h-10 items-end gap-1" aria-label={`Tendencia de ${s.name}`}>
                    {s.trend.map((t) => (
                      <div
                        key={t.label}
                        title={`${t.label}: ${t.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                        className="flex-1 rounded-sm bg-mawi-200"
                        style={{ height: `${max === min ? 60 : 20 + ((t.value - min) / (max - min)) * 80}%` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Áreas: Rock y KPIs */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Prioridades por área</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {overview.areas.map((area) => {
            const rock = area.principalRock;
            const st = rock ? rockStatus(rock.status) : null;
            return (
              <div key={area.id} className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{area.name}</h3>
                  <span className="text-xs text-gray-400">{area.leader?.name ?? ""}</span>
                </div>
                {rock ? (
                  <div className="mt-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-900">{rock.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st!.badge}`}>{st!.label}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                      <div className="h-1.5 rounded-full bg-mawi-600" style={{ width: `${Math.min(rock.progress, 100)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {rock.progress}% de avance
                      {area.rocks.length > 1 ? ` · ${area.rocks.length - 1} Rock${area.rocks.length > 2 ? "s" : ""} más en el área` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-400">Rock del área por definir.</p>
                )}
                {area.metrics.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
                    {area.metrics.map((m) => (
                      <li key={m.selectionId} className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 items-start gap-1.5 text-gray-600">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${m.signal ? SIGNAL_STYLE[m.signal].dot : "bg-gray-200"}`} aria-hidden="true" />
                          <span className="break-words">
                            {m.label}
                            {m.group && <span className="block text-[11px] text-gray-400">{m.group}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          {m.pendingConfig ? (
                            <span className="text-xs text-gray-400">por configurar</span>
                          ) : (
                            <>
                              <span className="font-medium text-gray-900">{m.valueText ?? "sin dato"}</span>
                              {m.targetText && <span className="ml-1 text-xs text-gray-400">/ {m.targetText}</span>}
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Último resumen publicado */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold text-gray-900">Último resumen semanal</h2>
            <Link href="/semana" className="text-xs font-medium text-mawi-700 hover:underline">Ver semanas</Link>
          </div>
          {lastSummary?.draftText ? (
            <>
              <p className="mt-1 text-xs text-gray-400">Semana del {weekLabel(lastSummary.periodStart)}</p>
              <div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {plain(lastSummary.draftText.split(THREAD_MARKER)[0])}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-500">El primer resumen se publica este viernes en #weekly-check-ins.</p>
          )}
        </section>

        {/* Energía del equipo */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Energía del equipo</h2>
          <p className="mt-1 text-xs text-gray-400">Promedio semanal del check-in (1 a 5). Nunca por persona.</p>
          {hasEnergy ? (
            <div className="mt-4 flex h-32 items-end gap-2">
              {energy.map(({ week, summary }) => {
                const show = summary && summary.count >= ENERGY_MIN_SAMPLE;
                return (
                  <div key={week.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-medium text-gray-700">{show ? String(summary!.average).replace(".", ",") : ""}</span>
                    <div
                      className={`w-full rounded-sm ${show ? "bg-mawi-400" : "bg-gray-100"}`}
                      style={{ height: show ? `${(summary!.average / 5) * 100}%` : "6%" }}
                      title={show ? `${summary!.count} respuestas` : "Sin datos suficientes"}
                    />
                    <span className="text-[10px] text-gray-400">{week.toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" })}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">Aparece cuando al menos 3 personas respondan el check-in de una semana.</p>
          )}
        </section>
      </div>
    </div>
  );
}
