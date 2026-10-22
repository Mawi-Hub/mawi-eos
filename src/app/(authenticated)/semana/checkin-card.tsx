import type { TeamCheckin } from "@/generated/prisma/client";
import { formatCrDateTime } from "@/lib/time/costaRica";
import { BLOCKER_QUESTION, COMMITMENT_QUESTION, PREVIOUS_STATUS_LABEL, teamConfig } from "@/lib/checkin/teams";
import { CheckinToggles } from "./checkin-toggles";

const PREV_STYLE: Record<string, string> = {
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50 text-amber-700 ring-amber-200",
  not_done: "bg-red-50 text-red-700 ring-red-200",
};

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

// Pregunta tal como la vio la persona en el formulario, y su respuesta debajo.
function Answer({ question, children, tone = "default" }: { question: string; children: React.ReactNode; tone?: "default" | "alert" }) {
  const alert = tone === "alert";
  return (
    <div className={alert ? "rounded-lg bg-red-50 p-3" : ""}>
      <p className={`text-xs leading-snug ${alert ? "font-medium text-red-700" : "text-gray-500"}`}>{question}</p>
      <p className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${alert ? "text-red-950" : "text-gray-900"}`}>{children}</p>
    </div>
  );
}

// Respuesta de una persona al check-in semanal, con las preguntas de su equipo.
export function CheckinCard({ checkin: r, canManage }: { checkin: TeamCheckin; canManage: boolean }) {
  const team = teamConfig(r.teamKey);
  const numbers = (Array.isArray(r.numbers) ? (r.numbers as Array<{ label: string; value: number | null }>) : []).filter((n) => n.value !== null);

  return (
    <article
      className={`min-w-0 rounded-xl border bg-white ${r.hidden ? "border-gray-200 opacity-60" : r.highlighted ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-gray-100 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mawi-50 text-xs font-semibold text-mawi-700" aria-hidden="true">
            {initials(r.authorName)}
          </span>
          <div className="min-w-0">
            <div className="break-words font-medium text-gray-900">{r.authorName}</div>
            <div className="text-xs text-gray-400">
              {team?.name ?? r.teamKey} · {formatCrDateTime(r.submittedAt)}
            </div>
          </div>
        </div>
        {canManage && <CheckinToggles checkinId={r.id} hidden={r.hidden} highlighted={r.highlighted} />}
      </header>

      <div className="space-y-4 px-5 py-4">
        {r.previousCommitment && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="text-xs text-gray-500">La semana pasada se comprometió a:</span>
            <span className="text-gray-700">{r.previousCommitment}</span>
            {r.previousCommitmentStatus && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PREV_STYLE[r.previousCommitmentStatus] ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}
              >
                {PREVIOUS_STATUS_LABEL[r.previousCommitmentStatus] ?? r.previousCommitmentStatus}
              </span>
            )}
          </div>
        )}

        <Answer question={team?.result ?? "Resultado"}>{r.result}</Answer>
        <Answer question={team?.learning ?? "Aprendizaje"}>{r.learning}</Answer>
        {r.extra && <Answer question={team?.extra ?? "Otro"}>{r.extra}</Answer>}

        {numbers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {numbers.map((n) => (
              <div key={n.label} className="rounded-lg border border-mawi-100 bg-mawi-50/60 px-3 py-1.5">
                <div className="text-[11px] text-mawi-700">{n.label}</div>
                <div className="text-base font-semibold text-gray-900">{n.value!.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
              </div>
            ))}
          </div>
        )}

        {r.blocker && (
          <Answer question={BLOCKER_QUESTION} tone="alert">
            {r.blocker}
          </Answer>
        )}
      </div>

      <footer className="rounded-b-xl border-t border-gray-100 bg-gray-50/70 px-5 py-3">
        <p className="text-xs text-gray-500">{COMMITMENT_QUESTION}</p>
        <p className="mt-0.5 text-sm font-medium text-gray-900">{r.commitment}</p>
      </footer>
    </article>
  );
}
