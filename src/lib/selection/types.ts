import type { DataState } from "@/lib/metrics/dataState";

// Definición versionada de una métrica seleccionada. Todo es opcional: lo que
// falta se muestra como pendiente de configuración, no se inventa.
export type MetricDefinition = {
  label?: string;
  description?: string;
  unit?: string;
  frequency?: "weekly" | "biweekly" | "monthly";
  direction?: "above" | "below" | "equal";
  source?: string;
  numerator?: string;
  denominator?: string;
  formulaVersion?: string;
  aggregation?: "last" | "sum" | "avg" | "max";
  target?: number | null;
  targetText?: string | null;
  // La meta cuenta solo si alguien la confirmó. Las referencias de propuestas
  // comerciales viven en `reference` y no pintan semáforos.
  targetConfirmed?: boolean;
  reference?: string;
  notes?: string;
};

export type SelectionMetricView = {
  selectionId: string;
  areaId: string;
  areaKey: string;
  areaName: string;
  sortOrder: number;
  label: string;
  approvalStatus: "pending" | "approved";
  // Sin métrica real detrás, o sin aprobar: se muestra como configuración
  // por resolver, nunca como resultado.
  pendingConfig: boolean;
  planKpiId: string | null;
  scorecardMetricId: string | null;
  proposalKey: string | null;
  definition: MetricDefinition | null;
  metric: {
    id: string;
    name: string;
    unit: string | null;
    frequency: string;
    dataSource: string;
    ownerId: string;
    ownerName: string;
    targetValue: string | null;
    targetNumeric: number | null;
    targetDirection: string;
    aggregation: string;
    percentScale: string;
  } | null;
  entry: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    actualValue: number | null;
    actualDisplay: string | null;
    status: string;
    updatedAt: Date;
    numerator: number | null;
    denominator: number | null;
  } | null;
  dataState: DataState;
  valueText: string | null;
  nOverN: string | null;
  targetText: string | null;
  signal: "on_track" | "riesgo" | "off_track" | null;
  periodLabel: string;
  lastValid: { valueText: string; periodLabel: string } | null;
  reportOwnerName: string | null;
};

export type QuarterSelection = {
  quarterId: string;
  planId: string | null;
  // false = el trimestre nunca tuvo selección: "legado sin selección
  // registrada". No se reconstruye ni se hace fallback a todas las métricas.
  hasSelection: boolean;
  rows: SelectionMetricView[];
};
