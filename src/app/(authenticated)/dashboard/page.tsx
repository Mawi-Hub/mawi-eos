import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homePathFor } from "@/lib/access";
import { ceoExceptions } from "@/lib/company/exceptions";
import { northStars } from "@/lib/company/northStars";
import { rockStatus } from "@/lib/company/areas";
import { FinanceSection } from "./finance";

export const dynamic = "force-dynamic";

const SIGNAL_DOT = { on_track: "bg-emerald-500", riesgo: "bg-amber-500", off_track: "bg-red-500" } as const;

function Card({ title, count, tone, children, href }: { title: string; count: number; tone: "red" | "amber" | "gray"; children: React.ReactNode; href?: string }) {
  const badge = count === 0 ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-red-50 text-red-700" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-600";
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>{count === 0 ? "Todo bien" : count}</span>
          {href && <Link href={href} className="text-xs font-medium text-mawi-700 hover:underline">Ver</Link>}
        </div>
      </div>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}

// Vista CEO: excepciones primero (lo que pide atención antes de la L10), las
// métricas norte contra el plan y, abajo, las finanzas de ChartMogul y HubSpot.
export default async function DashboardPage() {
  const session = await auth();
  if (session?.user?.role !== "ceo") redirect(homePathFor(session?.user?.role));

  const now = new Date();
  const [x, stars] = await Promise.all([ceoExceptions(now), northStars(now)]);
  const pendingPreps = x.preps.filter((p) => p.status !== "confirmed");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vista CEO</h1>
        <p className="mt-1 text-sm text-gray-500">Lo que se desvía esta semana. Lo que está en verde no aparece.</p>
      </div>

      {stars.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stars.map((s) => (
            <div key={s.slug} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                {s.signal && <span className={`h-2 w-2 rounded-full ${SIGNAL_DOT[s.signal]}`} aria-hidden="true" />}
                {s.name}
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{s.valueText ?? "—"}</div>
              <div className="text-xs text-gray-500">{s.periodLabel ? `${s.periodLabel} · ` : ""}plan {s.planText ?? "—"}</div>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Rocks en riesgo" count={x.rocksAtRisk.length} tone="red" href="/rocks">
          {x.rocksAtRisk.length === 0 ? (
            <p className="text-gray-500">Ningún Rock en riesgo.</p>
          ) : (
            <ul className="space-y-2">
              {x.rocksAtRisk.map((r) => (
                <li key={r.id}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-gray-900">{r.title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${rockStatus(r.status).badge}`}>{rockStatus(r.status).label}</span>
                  </div>
                  <div className="text-xs text-gray-500">{r.areaName} · {r.ownerName}{r.risk ? ` · ${r.risk}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
          {x.rocksStale.length > 0 && (
            <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-amber-700">
              Sin actualizar hace 14 días o más: {x.rocksStale.map((r) => `${r.title} (${r.ownerName}, ${r.daysSinceUpdate} d)`).join(" · ")}
            </p>
          )}
        </Card>

        <Card title="Métricas fuera de meta" count={x.redMetrics.length} tone="red" href="/scorecard">
          {x.redMetrics.length === 0 ? (
            <p className="text-gray-500">Todas las métricas con dato están en meta.</p>
          ) : (
            <ul className="space-y-1.5">
              {x.redMetrics.map((m) => (
                <li key={`${m.areaName}:${m.label}`} className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${SIGNAL_DOT[m.signal as keyof typeof SIGNAL_DOT] ?? "bg-gray-300"}`} aria-hidden="true" />
                    <span className="truncate text-gray-800">{m.label}</span>
                    <span className="shrink-0 text-xs text-gray-400">{m.areaName}</span>
                  </span>
                  <span className="shrink-0 text-gray-900">
                    {m.valueText} <span className="text-xs text-gray-400">/ {m.targetText}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {x.missingMetrics.length > 0 && (
            <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
              Sin dato del período: {x.missingMetrics.map((m) => `${m.label}${m.owner ? ` (${m.owner})` : ""}`).join(" · ")}
            </p>
          )}
        </Card>

        <Card title="Compromisos vencidos" count={x.overdueCommitments.length} tone="amber" href="/l10">
          {x.overdueCommitments.length === 0 ? (
            <p className="text-gray-500">No hay compromisos vencidos.</p>
          ) : (
            <ul className="space-y-1.5">
              {x.overdueCommitments.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-gray-800">{c.action}</span>
                  <span className="shrink-0 text-xs text-gray-500">{c.ownerName} · {c.daysLate} d tarde</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Decisiones pendientes (IDS)" count={x.openIssues.length} tone="gray" href="/l10">
          {x.openIssues.length === 0 ? (
            <p className="text-gray-500">No hay IDS abiertos en la próxima reunión.</p>
          ) : (
            <ul className="space-y-1.5">
              {x.openIssues.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-gray-800">{i.title}</span>
                  <span className="shrink-0 text-xs text-gray-500">{i.raisedBy}{i.votes ? ` · ▲${i.votes}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Check-in del equipo" count={x.checkin.pending.length} tone="amber" href={`/semana?w=${x.weekIso}`}>
          <p className="text-gray-700">
            Respondieron <strong>{x.checkin.answered}</strong> de {x.checkin.expected} esta semana.
          </p>
          {x.checkin.pending.length > 0 && <p className="mt-1 text-xs text-gray-500">Faltan: {x.checkin.pending.map((p) => p.name).join(", ")}</p>}
          {pendingPreps.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Preparación de managers sin confirmar: {pendingPreps.map((p) => `${p.areaName}${p.leaderName ? ` (${p.leaderName})` : ""}`).join(" · ")}
            </p>
          )}
        </Card>

        <Card title="Energía por área" count={x.energyByArea.filter((e) => e.low > 0).length} tone="amber">
          <ul className="space-y-1.5">
            {x.energyByArea.map((e) => (
              <li key={e.areaName} className="flex items-baseline justify-between gap-3">
                <span className="text-gray-800">{e.areaName}</span>
                <span className="text-xs text-gray-500">
                  {e.average === null ? (e.count ? `${e.count} respuesta${e.count === 1 ? "" : "s"} (mínimo 3 para mostrar)` : "sin respuestas") : (
                    <>
                      <strong className="text-sm text-gray-900">{String(e.average).replace(".", ",")}</strong>/5
                      {e.low > 0 ? ` · ${e.low} en 1–2` : ""}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <details className="rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Finanzas y adquisición (ChartMogul · HubSpot)</summary>
        <div className="border-t border-gray-100 p-5">
          <FinanceSection />
        </div>
      </details>
    </div>
  );
}
