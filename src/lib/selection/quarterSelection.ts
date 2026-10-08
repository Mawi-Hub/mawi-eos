// Resolver compartido de la selección trimestral. Plan H2, Scorecard, L10, los
// check-ins y el resumen leen de acá: una sola lista por trimestre, nunca dos
// listas independientes por vista.

import { prisma } from "@/lib/db";
import { calculateStatus } from "@/lib/utils";
import { crParts } from "@/lib/time/costaRica";
import { describePeriod, formatMetricValue } from "@/lib/metrics/format";
import { formatNOverN, isActionableState, resolveDataState, type DataState } from "@/lib/metrics/dataState";
import { isSelectionEnabled } from "@/lib/report/config";
import type { MetricDefinition, QuarterSelection, SelectionMetricView } from "./types";

type Options = { now?: Date; cutAt?: Date };

function asDefinition(value: unknown): MetricDefinition | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as MetricDefinition) : null;
}

export async function getQuarterSelection(quarterId: string, options: Options = {}): Promise<QuarterSelection> {
  const now = options.now ?? new Date();
  const cutAt = options.cutAt ?? now;

  const quarter = await prisma.quarter.findUnique({ where: { id: quarterId }, select: { id: true, planId: true, startDate: true } });
  const selections = await prisma.quarterMetricSelection.findMany({
    where: { quarterId },
    include: {
      area: true,
      planKpi: { select: { id: true, name: true, scorecardMetricId: true } },
      scorecardMetric: { include: { owner: { select: { name: true } } } },
    },
    orderBy: [{ area: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  if (selections.length === 0) {
    return { quarterId, planId: quarter?.planId ?? null, hasSelection: false, rows: [] };
  }

  // La métrica efectiva: la elegida directamente, o la mapeada desde el KPI.
  const metricIds = new Set<string>();
  for (const s of selections) {
    const id = s.scorecardMetricId ?? s.planKpi?.scorecardMetricId ?? null;
    if (id) metricIds.add(id);
  }
  const metrics = metricIds.size
    ? await prisma.scorecardMetric.findMany({
        where: { id: { in: [...metricIds] } },
        include: {
          owner: { select: { name: true } },
          // Último dato con corte: una entrada posterior al corte no cuenta.
          entries: { where: { periodStart: { lte: cutAt } }, orderBy: { periodStart: "desc" }, take: 6 },
        },
      })
    : [];
  const metricById = new Map(metrics.map((m) => [m.id, m]));

  const ownerIds = [...new Set(selections.map((s) => s.reportOwnerId).filter((v): v is string => !!v))];
  const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } }) : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));

  const nowParts = crParts(now);

  const rows: SelectionMetricView[] = selections.map((s) => {
    const definition = asDefinition(s.definition);
    const effectiveMetricId = s.scorecardMetricId ?? s.planKpi?.scorecardMetricId ?? null;
    const metric = effectiveMetricId ? metricById.get(effectiveMetricId) ?? null : null;
    const approved = s.approvalStatus === "approved";
    const resolved = !!metric;
    const label = s.displayLabel ?? definition?.label ?? metric?.name ?? s.planKpi?.name ?? s.proposalKey ?? "Métrica";

    const entry = metric?.entries[0] ?? null;
    const frequency = definition?.frequency ?? metric?.frequency ?? "weekly";
    const state: DataState = !resolved
      ? "pending"
      : resolveDataState(entry, { frequency, now, autoSynced: entry ? metric?.dataSource !== "manual" : false });

    const unit = definition?.unit ?? metric?.unit ?? null;
    const actionable = isActionableState(state);
    const valueText =
      actionable && entry ? entry.actualDisplay ?? formatMetricValue(entry.actualValue, unit) : null;

    const periodParts = entry ? crParts(entry.periodStart) : null;
    const periodLabel = entry && periodParts ? describePeriod(frequency, entry.periodStart, nowParts, periodParts) : "sin dato del período";

    // La última lectura válida solo se muestra como "anterior" cuando la actual falta.
    let lastValid: SelectionMetricView["lastValid"] = null;
    if (!actionable && metric) {
      const prev = metric.entries.find((e) => e.actualValue !== null && e.dataState === null);
      if (prev) {
        const prevParts = crParts(prev.periodStart);
        lastValid = {
          valueText: prev.actualDisplay ?? formatMetricValue(prev.actualValue, unit) ?? "—",
          periodLabel: describePeriod(frequency, prev.periodStart, nowParts, prevParts),
        };
      }
    }

    // Semáforo: meta confirmada + regla + dato vigente. Sin eso, ninguno.
    const targetConfirmed = approved && definition?.targetConfirmed === true;
    const target = definition?.target ?? metric?.targetNumeric ?? null;
    const direction = definition?.direction ?? (metric?.targetDirection as "above" | "below" | "equal" | undefined) ?? "above";
    const signal =
      targetConfirmed && actionable && entry?.actualValue != null && target != null
        ? (calculateStatus(entry.actualValue, target, direction) as SelectionMetricView["signal"])
        : null;
    const targetText = targetConfirmed ? definition?.targetText ?? metric?.targetValue ?? (target != null ? String(target) : null) : null;

    return {
      selectionId: s.id,
      areaId: s.areaId,
      areaKey: s.area.key,
      areaName: s.area.name,
      sortOrder: s.sortOrder,
      label,
      approvalStatus: approved ? "approved" : "pending",
      pendingConfig: !resolved || !approved,
      planKpiId: s.planKpiId,
      scorecardMetricId: effectiveMetricId,
      proposalKey: s.proposalKey,
      definition,
      metric: metric
        ? {
            id: metric.id,
            name: metric.name,
            unit: metric.unit,
            frequency: metric.frequency,
            dataSource: metric.dataSource,
            ownerId: metric.ownerId,
            ownerName: metric.owner.name,
            targetValue: metric.targetValue,
            targetNumeric: metric.targetNumeric,
            targetDirection: metric.targetDirection,
            aggregation: metric.aggregation,
            percentScale: metric.percentScale,
          }
        : null,
      entry: entry
        ? {
            id: entry.id,
            periodStart: entry.periodStart,
            periodEnd: entry.periodEnd,
            actualValue: entry.actualValue,
            actualDisplay: entry.actualDisplay,
            status: entry.status,
            updatedAt: entry.updatedAt,
            numerator: entry.numerator,
            denominator: entry.denominator,
          }
        : null,
      dataState: state,
      valueText,
      nOverN: entry ? formatNOverN(entry.numerator, entry.denominator) : null,
      targetText,
      signal,
      periodLabel,
      lastValid,
      reportOwnerName: s.reportOwnerId ? ownerName.get(s.reportOwnerId) ?? null : metric?.owner.name ?? null,
    };
  });

  return { quarterId, planId: quarter?.planId ?? null, hasSelection: true, rows };
}

// Alcance de métricas para una vista. Con la bandera apagada todo se comporta
// como antes (isActive); con ella encendida la selección del trimestre manda y
// un trimestre sin selección no recupera "todas" como respaldo.
export type MetricScope =
  | { mode: "legacy" }
  | { mode: "selection"; hasSelection: boolean; metricIds: Set<string>; selection: QuarterSelection };

export async function getMetricScope(quarterId: string | null | undefined, options: Options = {}): Promise<MetricScope> {
  if (!isSelectionEnabled() || !quarterId) return { mode: "legacy" };
  const selection = await getQuarterSelection(quarterId, options);
  const metricIds = new Set(selection.rows.map((r) => r.scorecardMetricId).filter((v): v is string => !!v));
  return { mode: "selection", hasSelection: selection.hasSelection, metricIds, selection };
}

export function inScope(scope: MetricScope, metricId: string): boolean {
  return scope.mode === "legacy" ? true : scope.metricIds.has(metricId);
}
