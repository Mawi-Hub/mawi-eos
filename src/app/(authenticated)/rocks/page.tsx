import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { quarterOverview, rockStatus, type AreaRock } from "@/lib/company/areas";
import { maxRocksPerPerson } from "@/lib/company/config";
import { RockForm } from "./rock-form";
import { RockUpdateForm } from "./rock-update-form";
import { RockEditForm } from "./rock-edit-form";

function RockCard({ rock, canEdit }: { rock: AreaRock; canEdit: boolean }) {
  const st = rockStatus(rock.finalStatus ?? rock.status);
  return (
    <div className={`rounded-xl border bg-white p-5 ${rock.principal ? "border-mawi-300" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {rock.principal && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-mawi-600">Rock del área</div>}
          <h3 className="text-sm font-semibold text-gray-900">{rock.title}</h3>
          <p className="mt-0.5 text-xs text-gray-400">{rock.ownerName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.badge}`}>{st.label}</span>
      </div>
      <p className="mt-2 text-xs text-gray-600">{rock.description}</p>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Avance</span>
          <span className="font-medium text-gray-900">{rock.progress}%</span>
        </div>
        <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
          <div className="h-2 rounded-full bg-mawi-600" style={{ width: `${Math.min(rock.progress, 100)}%` }} />
        </div>
      </div>
      {rock.risk && (
        <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          <span className="font-medium">Riesgo:</span> {rock.risk}
        </div>
      )}
      <div className="mt-3 space-y-1 text-xs text-gray-500">
        <p><span className="font-medium">Entregable:</span> {rock.deliverable}</p>
        <p><span className="font-medium">Criterio de cumplido:</span> {rock.doneCriteria}</p>
      </div>
      {canEdit && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
          <RockUpdateForm rockId={rock.id} currentProgress={rock.progress} currentStatus={rock.status} currentRisk={rock.risk || ""} />
          <RockEditForm
            rockId={rock.id}
            currentTitle={rock.title}
            currentDescription={rock.description}
            currentDeliverable={rock.deliverable}
            currentDoneCriteria={rock.doneCriteria}
          />
        </div>
      )}
    </div>
  );
}

export default async function RocksPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  const { q } = await searchParams;
  const quarters = await prisma.quarter.findMany({ orderBy: [{ year: "desc" }, { quarter: "desc" }] });
  const selected = (q && quarters.find((x) => x.id === q)) || quarters.find((x) => x.isActive) || null;

  if (!selected) {
    return <div className="py-12 text-center text-gray-500">No hay trimestre activo.</div>;
  }

  const overview = await quarterOverview(selected.id);
  const userId = session?.user?.id;
  const isCeo = session?.user?.role === "ceo";
  const editable = (r: AreaRock) => selected.isActive && (r.ownerId === userId || isCeo);
  const ownCount = [...overview.areas.flatMap((a) => a.rocks), ...overview.otherRocks].filter((r) => r.ownerId === userId).length;
  const total = overview.areas.reduce((n, a) => n + a.rocks.length, 0) + overview.otherRocks.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rocks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Q{selected.quarter} {selected.year} · {total} Rock{total === 1 ? "" : "s"} · las prioridades del trimestre por área
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium">
            {quarters.slice(0, 4).map((x) => (
              <Link
                key={x.id}
                href={`/rocks?q=${x.id}`}
                className={`rounded-md px-3 py-1.5 ${x.id === selected.id ? "bg-mawi-100 text-mawi-800" : "text-gray-500 hover:text-gray-900"}`}
              >
                Q{x.quarter} {x.year}
                {x.isActive ? " · activo" : ""}
              </Link>
            ))}
          </div>
          {selected.isActive && ownCount < maxRocksPerPerson() && session?.user?.role !== "team" && <RockForm quarterId={selected.id} />}
        </div>
      </div>

      {overview.areas.map((area) => (
        <section key={area.id} className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{area.name}</h2>
            {area.leader && <span className="text-sm text-gray-400">· {area.leader.name}</span>}
          </div>
          {area.rocks.length === 0 ? (
            <p className="text-sm text-gray-400">Sin Rocks este trimestre.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {area.rocks.map((r) => (
                <RockCard key={r.id} rock={r} canEdit={editable(r)} />
              ))}
            </div>
          )}
        </section>
      ))}

      {overview.otherRocks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Otros Rocks</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {overview.otherRocks.map((r) => (
              <RockCard key={r.id} rock={r} canEdit={editable(r)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
