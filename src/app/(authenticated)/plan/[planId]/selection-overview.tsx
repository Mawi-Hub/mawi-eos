import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlanNorthStars } from "@/components/plan/PlanNorthStars";
import { PlanSelectionAreaSection } from "@/components/plan/PlanSelectionAreaSection";
import type { KPIDirection } from "@/lib/plan/calculations";
import { overlayScorecardActuals } from "@/lib/plan/scorecardOverlay";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import { quarterLabel, resolveQuarter, sortQuarters } from "@/lib/plan/quarterPick";
import {
  COMERCIAL_UNSPLIT_LABEL,
  GENERAL_LABEL,
  groupByDisplayArea,
  type ClassifyContext,
  type DisplayAreaKey,
} from "@/lib/plan/legacyArea";
import type { SelectionMetricView } from "@/lib/selection/types";
import { PlanSyncButton } from "./sync-button";
import { PlanShareButton } from "./share-button";

// Portada del Plan H2 en modo selección: por trimestre y por área de reporte,
// solo las métricas elegidas. El árbol de ingresos y las 3 palancas quedan
// fuera de la portada porque dependen de métricas de diagnóstico y de
// supuestos fijos (p. ej. 30 clientes x USD 452) que no son metas vigentes.
export async function SelectionOverview({
  planId,
  requestedQuarter,
  isCeo,
}: {
  planId: string;
  requestedQuarter: string | string[] | undefined;
  isCeo: boolean;
}) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      quarters: true,
      kpis: {
        include: {
          entries: { orderBy: { period: "asc" } },
          owner: { select: { id: true, name: true, role: true } },
        },
        orderBy: { displayOrder: "asc" },
      },
      actions: { include: { owner: { select: { id: true, name: true } } }, orderBy: { displayOrder: "asc" } },
      risks: { orderBy: { displayOrder: "asc" } },
    },
  });
  if (!plan) notFound();

  const quarter = resolveQuarter(plan.quarters, requestedQuarter);
  const selection = quarter ? await getQuarterSelection(quarter.id) : null;

  const [areas, configs] = await Promise.all([
    prisma.reportArea.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    quarter ? prisma.areaQuarterConfig.findMany({ where: { quarterId: quarter.id } }) : Promise.resolve([]),
  ]);
  const configByArea = new Map(configs.map((c) => [c.areaId, c]));

  // Responsables resueltos ANTES de filtrar: líder del área / owner del reporte.
  const rockIds = configs.map((c) => c.principalRockId).filter((v): v is string => !!v);
  const rocks = rockIds.length
    ? await prisma.rock.findMany({ where: { id: { in: rockIds } }, include: { owner: { select: { name: true } } } })
    : [];
  const rockById = new Map(rocks.map((r) => [r.id, r]));

  const userIds = new Set<string>();
  for (const a of areas) {
    if (a.leaderId) userIds.add(a.leaderId);
    if (a.alternateId) userIds.add(a.alternateId);
  }
  for (const c of configs) if (c.reportOwnerId) userIds.add(c.reportOwnerId);
  const users = userIds.size ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } }) : [];
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const ownerNameFor = (area: (typeof areas)[number]): string | null => {
    const cfg = configByArea.get(area.id);
    const id = cfg?.reportOwnerId ?? area.leaderId;
    return id ? userName.get(id) ?? null : null;
  };

  // Quién pertenece a Ventas o a Growth, para repartir el enum COMERCIAL.
  const ctx: ClassifyContext = { ventasUserIds: new Set(), growthUserIds: new Set() };
  for (const a of areas) {
    const target = a.key === "ventas" ? ctx.ventasUserIds : a.key === "growth" ? ctx.growthUserIds : null;
    if (!target) continue;
    for (const id of [a.leaderId, a.alternateId, configByArea.get(a.id)?.reportOwnerId]) if (id) target.add(id);
  }

  const knownKeys = new Set(areas.map((a) => a.key));
  const actionsByKey = groupByDisplayArea(
    plan.actions.map((a) => ({ ...a, ownerId: a.ownerId })),
    ctx,
    knownKeys,
  );
  const risksByKey = groupByDisplayArea(
    plan.risks.map((r) => ({ ...r, ownerId: null as string | null })),
    ctx,
    knownKeys,
  );

  const rowsByArea = new Map<string, SelectionMetricView[]>();
  for (const row of selection?.rows ?? []) {
    const list = rowsByArea.get(row.areaKey) ?? [];
    list.push(row);
    rowsByArea.set(row.areaKey, list);
  }

  const toItem = (x: { id: string; title: string; description?: string | null; expectedImpact?: string | null; owner?: { name: string } | null }) => ({
    id: x.id,
    title: x.title,
    description: x.description ?? null,
    expectedImpact: x.expectedImpact ?? null,
    ownerName: x.owner?.name ?? null,
  });
  const hasSelection = selection?.hasSelection ?? false;

  const extraKeys: DisplayAreaKey[] = ["comercial_sin_separar", "general"];

  const kpisForUI = await overlayScorecardActuals(
    plan.kpis.map((k) => ({
      id: k.id,
      slug: k.slug,
      name: k.name,
      unit: k.unit,
      direction: k.direction as KPIDirection,
      baseline: k.baseline,
      target: k.target,
      area: k.area as string,
      isPrincipal: k.isPrincipal,
      sourceType: k.sourceType as string,
      sourceKey: k.sourceKey,
      scorecardMetricId: k.scorecardMetricId,
      owner: k.owner,
      entries: k.entries.map((e) => ({ period: e.period, projected: e.projected, actual: e.actual })),
    })),
  );
  const northStarKpis = kpisForUI.filter((k) => k.area === "NORTH_STAR");

  const quarters = sortQuarters(plan.quarters);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-3">
        {isCeo && <PlanSyncButton planId={planId} />}
        <PlanShareButton planId={planId} />
      </section>

      {quarters.length > 0 && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Trimestre">
          {quarters.map((q) => (
            <Link
              key={q.id}
              href={`/plan/${planId}?q=${q.id}`}
              className={`rounded-md px-3 py-1.5 ${
                q.id === quarter?.id ? "bg-mawi-100 font-medium text-mawi-800" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {quarterLabel(q)}
              {q.isActive ? " (activo)" : ""}
            </Link>
          ))}
        </nav>
      )}

      {quarter && !hasSelection && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          Legado sin selección registrada para {quarterLabel(quarter)}.{" "}
          <Link href={`/plan/${planId}/kpis`} className="font-medium text-mawi-700 hover:underline">
            Ver el catálogo de KPIs
          </Link>
        </div>
      )}

      {northStarKpis.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">North Stars</h2>
          <PlanNorthStars kpis={northStarKpis} />
        </section>
      )}

      <section className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Áreas del trimestre</h2>
        {areas.map((area) => {
          const cfg = configByArea.get(area.id);
          const rock = cfg?.principalRockId ? rockById.get(cfg.principalRockId) : null;
          return (
            <PlanSelectionAreaSection
              key={area.id}
              planId={planId}
              name={area.name}
              ownerName={ownerNameFor(area)}
              rows={hasSelection ? rowsByArea.get(area.key) ?? [] : null}
              principalRock={rock ? { title: rock.title, ownerName: rock.owner.name, progress: rock.progress, status: rock.status } : null}
              actions={(actionsByKey.get(area.key as DisplayAreaKey) ?? []).map(toItem)}
              risks={(risksByKey.get(area.key as DisplayAreaKey) ?? []).map(toItem)}
            />
          );
        })}
        {extraKeys.map((key) => {
          const actions = actionsByKey.get(key) ?? [];
          const risks = risksByKey.get(key) ?? [];
          if (actions.length === 0 && risks.length === 0) return null;
          return (
            <PlanSelectionAreaSection
              key={key}
              planId={planId}
              name={key === "general" ? GENERAL_LABEL : COMERCIAL_UNSPLIT_LABEL}
              subtitle={key === "general" ? undefined : "Aún no se separa entre Ventas y Growth"}
              ownerName={null}
              rows={null}
              principalRock={null}
              actions={actions.map(toItem)}
              risks={risks.map(toItem)}
            />
          );
        })}
      </section>

      <p className="text-xs text-gray-500">
        El árbol de ingresos y las 3 palancas dependen de métricas de diagnóstico y de supuestos (como 30 clientes nuevos al mes
        × USD 452) que no son metas vigentes del trimestre; se consultan en el{" "}
        <Link href={`/plan/${planId}/kpis`} className="font-medium text-mawi-700 hover:underline">
          catálogo de KPIs
        </Link>
        .
      </p>
    </div>
  );
}
