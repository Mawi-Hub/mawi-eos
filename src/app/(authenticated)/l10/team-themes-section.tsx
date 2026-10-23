import { themeMeta, themeRef, type TeamTheme } from "@/lib/weekly/themes";
import { AddIssueButton } from "./add-issue-button";

type Props = {
  themes: TeamTheme[];
  themesWeek: Date;
  meeting: { id: string; status: string; issueIds: string[] } | null;
  users: Array<{ id: string; name: string }>;
  rocks: Array<{ id: string; title: string }>;
  metrics: Array<{ id: string; name: string }>;
  remaining: number;
  // Con challenges de los líderes queda plegado y opcional; sin ellos, es la agenda.
  collapsed: boolean;
};

// Lo que se repite en el check-in del equipo: candidatos a IDS, nunca automáticos.
export function TeamThemesSection({ themes, themesWeek, meeting, users, rocks, metrics, remaining, collapsed }: Props) {
  const pending = themes.filter((t) => !t.issueId).length;
  const canPromote = !!meeting && meeting.status !== "completed";

  const list = (
    <ul className="divide-y divide-amber-100">
      {themes.map((t) => (
        <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{t.title}</p>
            <p className="mt-0.5 text-xs text-amber-800">{themeMeta(t)}</p>
            {t.detail && <p className="mt-1 text-sm text-gray-700">{t.detail}</p>}
            {t.quotes.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {t.quotes.map((q) => (
                  <p key={q} className="text-xs italic text-gray-500">“{q}”</p>
                ))}
              </div>
            )}
          </div>
          {t.issueId ? (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              En IDS{meeting?.issueIds.includes(t.issueId) ? "" : " (otra reunión)"}
            </span>
          ) : (
            canPromote && (
              <AddIssueButton
                meetingId={meeting!.id}
                users={users}
                rocks={rocks}
                metrics={metrics}
                remaining={remaining}
                teamTheme={{
                  ref: themeRef(themesWeek, t.id),
                  title: t.title,
                  description: [t.detail, `Del check-in del equipo: ${themeMeta(t)}.`].filter(Boolean).join("\n\n"),
                }}
              />
            )
          )}
        </li>
      ))}
    </ul>
  );

  const intro = "Sale de los check-ins de esta semana (bloqueos, aprendizajes y pedidos de ayuda). Sin nombres: el detalle por persona está en Semana. Llevar un tema a IDS no usa tu cupo de 3.";

  if (collapsed) {
    return (
      <details className="group rounded-lg border border-amber-200 bg-amber-50/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
          <span>
            <span className="text-sm font-semibold text-gray-900">Lo que se repite en el equipo</span>
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500 ring-1 ring-inset ring-amber-200">opcional</span>
            <span className="ml-2 text-xs text-gray-500">
              {themes.length} tema{themes.length === 1 ? "" : "s"}
              {pending < themes.length ? ` · ${themes.length - pending} en IDS` : ""} · si sobra tiempo después de los challenges
            </span>
          </span>
          <span className="text-xs text-amber-800 group-open:hidden">Ver</span>
          <span className="hidden text-xs text-amber-800 group-open:inline">Ocultar</span>
        </summary>
        <p className="border-t border-amber-100 px-5 py-2 text-xs text-gray-500">{intro}</p>
        {list}
      </details>
    );
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/40">
      <div className="border-b border-amber-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Lo que se repite en el equipo</h2>
        <p className="text-xs text-gray-600">
          <strong className="font-medium text-amber-900">No hay challenges esta semana:</strong> usen estos temas para el IDS. Llevá a IDS los que quieran discutir.
        </p>
        <p className="mt-1 text-xs text-gray-500">{intro}</p>
      </div>
      {list}
    </section>
  );
}
