// Contrato del snapshot del resumen de management. Es JSON puro y versionado:
// lo que se aprueba al cerrar es exactamente lo que se publica.

import type { DataState } from "@/lib/metrics/dataState";

export const SNAPSHOT_SCHEMA = 1;

export type RockStatusLabel = "en_camino" | "en_riesgo" | "completado" | "sin_estado";

export type MetricLine = {
  selectionId: string;
  label: string;
  // Texto ya formateado (con unidad). null si el dato está pendiente.
  valueText: string | null;
  nOverN: string | null;
  targetText: string | null; // null = meta pendiente de confirmar
  periodLabel: string;
  dataState: DataState;
  // Último valor válido, solo informativo cuando el actual falta.
  lastValid?: { valueText: string; periodLabel: string } | null;
  ownerName: string | null;
  pendingConfig: boolean; // definición sin aprobar / sin mapear
  // Semáforo solo con meta confirmada, regla y dato vigente.
  signal: "on_track" | "riesgo" | "off_track" | null;
};

export type AreaBlock = {
  areaKey: string;
  areaName: string;
  leaderName: string | null;
  rock: { title: string; status: RockStatusLabel; progress: number | null } | null;
  advance: string | null; // avance real, confirmado por el líder
  nextStep: string | null;
  prepStatus: "confirmed" | "draft" | "missing";
  metrics: MetricLine[];
};

export type WinItem = {
  id: string;
  areaKey: string | null;
  text: string;
  result: string | null;
  contributors: string[];
  why: string | null;
};

export type ContributionItem = {
  id: string; // CheckinEvidence.id
  areaKey: string | null;
  areaName: string | null;
  name: string;
  text: string; // línea ya sanitizada
  link: string | null; // Rock del área o aporte operativo
  late: boolean; // llegó después del corte de una versión ya publicada
};

export type BlockerItem = {
  id: string; // L10Issue.id
  text: string; // sharedSummary sanitizado — nunca el detalle del IDS
  impact: string | null;
  decision: string | null;
  helpFrom: string | null;
  neededBy: string | null; // YYYY-MM-DD
  resolved: boolean;
};

export type AgreementItem = {
  id: string; // L10Commitment.id
  action: string;
  ownerName: string;
  dueDate: string | null; // YYYY-MM-DD, null = por acordar
  originalDueDate: string | null;
  dateChangeReason: string | null;
  status: "open" | "done" | "pending";
  accepted: boolean;
  nextStep: string | null;
  previous: boolean; // acuerdo de una reunión anterior revisado en esta
};

export type MeetingReportSnapshot = {
  schema: typeof SNAPSHOT_SCHEMA;
  meetingId: string;
  meetingVersion: number;
  quarterLabel: string;
  meetingDate: string; // ISO
  period: { start: string; end: string; cutAt: string };
  objective: string | null;
  closedByName: string;
  companyMetrics: MetricLine[];
  areas: AreaBlock[];
  wins: WinItem[];
  contributions: ContributionItem[];
  blockers: BlockerItem[];
  agreements: AgreementItem[];
  detailUrl: string | null;
  notionUrl: string | null;
  // Cuando es una actualización: qué cambió respecto de la versión previa.
  update: { ofVersion: number; reason: string | null } | null;
};
