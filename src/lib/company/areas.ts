// Vista por área de un trimestre: líder, Rock principal y los demás Rocks,
// personas del equipo y métricas seleccionadas. La usan Cómo va Mawi, Rocks y
// Equipo y roles, para que las tres muestren lo mismo.

import { prisma } from "@/lib/db";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import type { SelectionMetricView } from "@/lib/selection/types";
import { teamConfig } from "@/lib/checkin/teams";

export type AreaRock = {
  id: string;
  title: string;
  description: string;
  deliverable: string;
  doneCriteria: string;
  status: string;
  progress: number;
  risk: string | null;
  finalStatus: string | null;
  ownerId: string;
  ownerName: string;
  principal: boolean;
};

export type AreaPerson = { id: string; name: string; teamName: string; isLeader: boolean };

export type AreaOverview = {
  id: string;
  key: string;
  name: string;
  leader: { id: string; name: string } | null;
  principalRock: AreaRock | null;
  rocks: AreaRock[]; // incluye el principal, primero
  people: AreaPerson[];
  metrics: SelectionMetricView[];
};

export type QuarterOverview = {
  quarter: { id: string; year: number; quarter: number; isActive: boolean; objective: string | null } | null;
  areas: AreaOverview[];
  // Rocks del trimestre cuyo dueño no lidera ningún área (p. ej. el del CEO).
  otherRocks: AreaRock[];
};

export async function quarterOverview(quarterId?: string | null, options: { now?: Date } = {}): Promise<QuarterOverview> {
  const quarter = quarterId
    ? await prisma.quarter.findUnique({ where: { id: quarterId } })
    : await prisma.quarter.findFirst({ where: { isActive: true } });
  if (!quarter) return { quarter: null, areas: [], otherRocks: [] };

  const now = options.now ?? new Date();
  const [areas, configs, rocks, members, selection] = await Promise.all([
    prisma.reportArea.findMany({ where: { active: true }, include: { leader: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.areaQuarterConfig.findMany({ where: { quarterId: quarter.id } }),
    prisma.rock.findMany({ where: { quarterId: quarter.id }, include: { owner: { select: { name: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.reportMember.findMany({
      // Solo el roster del check-in (personas con equipo asignado).
      where: { teamKey: { not: null }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      orderBy: [{ isLeader: "desc" }, { displayName: "asc" }],
    }),
    getQuarterSelection(quarter.id, { now }),
  ]);

  const principalIds = new Set(configs.map((c) => c.principalRockId).filter((v): v is string => !!v));
  const toRock = (r: (typeof rocks)[number]): AreaRock => ({
    id: r.id,
    title: r.title,
    description: r.description,
    deliverable: r.deliverable,
    doneCriteria: r.doneCriteria,
    status: r.status,
    progress: r.progress,
    risk: r.risk,
    finalStatus: r.finalStatus,
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    principal: principalIds.has(r.id),
  });

  const used = new Set<string>();
  const out: AreaOverview[] = areas.map((area) => {
    const cfg = configs.find((c) => c.areaId === area.id);
    const owners = new Set([area.leaderId, area.alternateId].filter((v): v is string => !!v));
    const areaRocks = rocks.filter((r) => r.id === cfg?.principalRockId || owners.has(r.ownerId)).map(toRock);
    const principal = areaRocks.find((r) => r.id === cfg?.principalRockId) ?? null;
    const ordered = principal ? [principal, ...areaRocks.filter((r) => r.id !== principal.id)] : areaRocks;
    for (const r of ordered) used.add(r.id);
    return {
      id: area.id,
      key: area.key,
      name: area.name,
      leader: area.leader,
      principalRock: principal,
      rocks: ordered,
      people: members
        .filter((m) => m.areaId === area.id)
        .map((m) => ({ id: m.id, name: m.displayName, teamName: teamConfig(m.teamKey)?.name ?? "—", isLeader: m.isLeader })),
      metrics: selection.rows.filter((r) => r.areaId === area.id),
    };
  });

  return {
    quarter: { id: quarter.id, year: quarter.year, quarter: quarter.quarter, isActive: quarter.isActive, objective: quarter.objective },
    areas: out,
    otherRocks: rocks.filter((r) => !used.has(r.id)).map(toRock),
  };
}

export const ROCK_STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  on_track: { label: "En camino", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  riesgo: { label: "En riesgo", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-800" },
  off_track: { label: "Fuera de camino", dot: "bg-red-500", badge: "bg-red-50 text-red-700" },
  done: { label: "Completado", dot: "bg-mawi-500", badge: "bg-mawi-50 text-mawi-800" },
  not_done: { label: "No cumplido", dot: "bg-gray-400", badge: "bg-gray-100 text-gray-600" },
};

export function rockStatus(status: string) {
  return ROCK_STATUS[status] ?? { label: status, dot: "bg-gray-300", badge: "bg-gray-100 text-gray-600" };
}
