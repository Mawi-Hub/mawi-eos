import "dotenv/config";
import { prisma } from "../../src/lib/db";

type Area = "NORTH_STAR" | "COMERCIAL" | "CUSTOMER_SUCCESS" | "PRODUCTO" | "INGENIERIA";
type OwnerRole = "ceo" | "sales" | "cs" | "product" | "engineering";

type KPISeed = {
  name: string;
  slug: string;
  category: "REVENUE" | "RETENTION" | "GROWTH" | "EFFICIENCY";
  area: Area;
  baseline: number;
  target: number;
  unit: "USD" | "PCT" | "count";
  direction: "ABOVE" | "BELOW";
  displayOrder: number;
  isPrincipal: boolean;
  sourceType: "MANUAL" | "CHARTMOGUL" | "HUBSPOT" | "POSTHOG" | "SCORECARD";
  sourceKey: string | null;
  ownerRole: OwnerRole;
  entries: { period: string; projected: number }[];
};

type ScorecardSeed = {
  name: string;
  category: "revenue_health" | "sales_health" | "customer_success" | "product_engineering" | "financial_health";
  ownerRole: OwnerRole;
  targetValue: string;
  targetNumeric: number;
  targetDirection: "above" | "below" | "equal";
  frequency: "weekly" | "biweekly" | "monthly" | "daily";
  unit: string;
  calculation: string;
  dataSource: "manual" | "chartmogul" | "hubspot" | "posthog" | "chat";
  sortOrder: number;
};

type ActionSeed = {
  area: Area;
  ownerRole: OwnerRole;
  title: string;
  expectedImpact: string;
  displayOrder: number;
};

type RiskSeed = {
  area: Area;
  title: string;
  description: string;
  displayOrder: number;
};

const PLAN: {
  name: string;
  type: "ANNUAL" | "SEMESTRAL";
  startDate: string;
  endDate: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
} = {
  name: "H2 2026",
  type: "SEMESTRAL",
  // Anchored to Costa Rica time (UTC-6): start of Jul 1 CR, end of Dec 31 CR.
  startDate: "2026-07-01T00:00:00-06:00",
  endDate: "2026-12-31T23:59:59-06:00",
  status: "ACTIVE",
};

const MONTHS = [
  "2026-05-01",
  "2026-06-01",
  "2026-07-01",
  "2026-08-01",
  "2026-09-01",
  "2026-10-01",
  "2026-11-01",
  "2026-12-01",
];

function linearEntries(baseline: number, target: number): { period: string; projected: number }[] {
  return MONTHS.map((period, idx) => {
    if (idx < 2) return { period, projected: baseline };
    const step = (target - baseline) / 6;
    return {
      period,
      projected: Number((baseline + step * (idx - 1)).toFixed(4)),
    };
  });
}

function flatEntries(value: number): { period: string; projected: number }[] {
  return MONTHS.map((period) => ({ period, projected: value }));
}

// Renames a Scorecard metric (idempotent): if `from` exists and `to` doesn't,
// rename in place. If both exist, delete the older one to converge to `to`.
const SCORECARD_RENAMES = [
  { from: "Time to Active", to: "Days to Activate" },
  { from: "Time to Adopt", to: "Days to Adopt" },
  { from: "NRR", to: "NDR" },
];

// Maps Plan KPI slug → Scorecard metric name for ChartMogul-sourced metrics.
// The sync route uses this to write ChartMogul fetches straight to Scorecard.
// Exported for /api/sync/plan-kpis.
export const CHARTMOGUL_SCORECARD_METRICS: { slug: string; name: string; isPct: boolean }[] = [
  { slug: "mrr", name: "MRR", isPct: false },
  { slug: "ndr", name: "NDR", isPct: true },
  { slug: "ccr", name: "CCR", isPct: true },
  { slug: "new_biz_mrr", name: "New Biz MRR", isPct: false },
  { slug: "expansion_mrr", name: "Expansion MRR", isPct: false },
  { slug: "asp", name: "ASP (Ticket promedio)", isPct: false },
];

const SCORECARD_METRICS: ScorecardSeed[] = [
  // NORTH STAR / Árbol del MRR — sincronizados desde ChartMogul
  {
    name: "MRR",
    category: "revenue_health",
    ownerRole: "ceo",
    targetValue: "$121K",
    targetNumeric: 121000,
    targetDirection: "above",
    frequency: "monthly",
    unit: "$",
    calculation: "Monthly Recurring Revenue (ChartMogul).",
    dataSource: "chartmogul",
    sortOrder: 1,
  },
  {
    name: "NDR",
    category: "revenue_health",
    ownerRole: "ceo",
    targetValue: "≥ 98.5%",
    targetNumeric: 98.5,
    targetDirection: "above",
    frequency: "monthly",
    unit: "%",
    calculation: "Net Dollar Retention = 1 − (MRR churn − expansion). ChartMogul.",
    dataSource: "chartmogul",
    sortOrder: 2,
  },
  {
    name: "CCR",
    category: "revenue_health",
    ownerRole: "ceo",
    targetValue: "≤ 2.7%",
    targetNumeric: 2.7,
    targetDirection: "below",
    frequency: "monthly",
    unit: "%",
    calculation: "Customer Churn Rate (logo) — ChartMogul.",
    dataSource: "chartmogul",
    sortOrder: 3,
  },
  {
    name: "New Biz MRR",
    category: "revenue_health",
    ownerRole: "sales",
    targetValue: "$13,560",
    targetNumeric: 13560,
    targetDirection: "above",
    frequency: "monthly",
    unit: "$",
    calculation: "MRR de clientes nuevos en el mes (ChartMogul).",
    dataSource: "chartmogul",
    sortOrder: 4,
  },
  {
    name: "Expansion MRR",
    category: "customer_success",
    ownerRole: "cs",
    targetValue: "$850",
    targetNumeric: 850,
    targetDirection: "above",
    frequency: "monthly",
    unit: "$",
    calculation: "MRR adicional de cuentas existentes (ChartMogul).",
    dataSource: "chartmogul",
    sortOrder: 5,
  },
  {
    name: "ASP (Ticket promedio)",
    category: "sales_health",
    ownerRole: "sales",
    targetValue: "≥ $450",
    targetNumeric: 450,
    targetDirection: "above",
    frequency: "monthly",
    unit: "$",
    calculation: "Average Sale Price de los nuevos cierres (ChartMogul).",
    dataSource: "chartmogul",
    sortOrder: 6,
  },

  // COMERCIAL — Fede
  {
    name: "Fit Score del cliente",
    category: "sales_health",
    ownerRole: "sales",
    targetValue: "≥ 80%",
    targetNumeric: 80,
    targetDirection: "above",
    frequency: "monthly",
    unit: "%",
    calculation:
      "% de clientes nuevos con Fit Score ≥80. Buen fit = menor churn temprano.",
    dataSource: "manual",
    sortOrder: 99,
  },
  {
    name: "Nuevos clientes / mes",
    category: "sales_health",
    ownerRole: "sales",
    targetValue: "≥ 30",
    targetNumeric: 30,
    targetDirection: "above",
    frequency: "weekly",
    unit: "count",
    calculation: "Conteo de nuevos clientes cerrados en el mes.",
    dataSource: "manual",
    sortOrder: 100,
  },
  {
    name: "Tasa cierre demo → venta",
    category: "sales_health",
    ownerRole: "sales",
    targetValue: "≥ 30%",
    targetNumeric: 30,
    targetDirection: "above",
    frequency: "monthly",
    unit: "%",
    calculation: "Cierres ÷ demos realizadas.",
    dataSource: "manual",
    sortOrder: 101,
  },
  {
    name: "CPL (costo por lead)",
    category: "sales_health",
    ownerRole: "sales",
    targetValue: "< $13",
    targetNumeric: 13,
    targetDirection: "below",
    frequency: "weekly",
    unit: "$",
    calculation: "Inversión en marketing ÷ leads generados.",
    dataSource: "manual",
    sortOrder: 102,
  },
  {
    name: "Deals cerrados / mes (rep)",
    category: "sales_health",
    ownerRole: "sales",
    targetValue: "≥ 5",
    targetNumeric: 5,
    targetDirection: "above",
    frequency: "weekly",
    unit: "count",
    calculation: "Deals cerrados por vendedor en el mes.",
    dataSource: "manual",
    sortOrder: 103,
  },

  // CUSTOMER SUCCESS — Gaby
  {
    name: "Cuentas activadas / onboard",
    category: "customer_success",
    ownerRole: "cs",
    targetValue: "≥ 90%",
    targetNumeric: 90,
    targetDirection: "above",
    frequency: "monthly",
    unit: "%",
    calculation: "% de cuentas en onboard que llegan a activación.",
    dataSource: "manual",
    sortOrder: 110,
  },
  {
    name: "Days to Activate",
    category: "customer_success",
    ownerRole: "cs",
    targetValue: "< 30 días",
    targetNumeric: 30,
    targetDirection: "below",
    frequency: "weekly",
    unit: "days",
    calculation: "Días entre kickoff y primera activación.",
    dataSource: "manual",
    sortOrder: 111,
  },
  {
    name: "Days to Adopt",
    category: "customer_success",
    ownerRole: "cs",
    targetValue: "< 60 días",
    targetNumeric: 60,
    targetDirection: "below",
    frequency: "monthly",
    unit: "days",
    calculation: "Días entre activación y adopción.",
    dataSource: "manual",
    sortOrder: 112,
  },
  {
    name: "Tickets resueltos sin desborde",
    category: "customer_success",
    ownerRole: "cs",
    targetValue: "Cero desborde",
    targetNumeric: 0,
    targetDirection: "below",
    frequency: "daily",
    unit: "count",
    calculation: "Tickets de soporte que requirieron escalamiento o se resolvieron fuera de SLA.",
    dataSource: "chat",
    sortOrder: 113,
  },

  // INGENIERÍA — Adrián
  {
    name: "MRR en Riesgo",
    category: "product_engineering",
    ownerRole: "engineering",
    targetValue: "$4,000",
    targetNumeric: 4000,
    targetDirection: "below",
    frequency: "weekly",
    unit: "$",
    calculation: "MRR asociado a clientes afectados por bugs o incidentes.",
    dataSource: "manual",
    sortOrder: 130,
  },
  {
    name: "MRR Potencial",
    category: "product_engineering",
    ownerRole: "engineering",
    targetValue: "—",
    targetNumeric: 0,
    targetDirection: "above",
    frequency: "weekly",
    unit: "$",
    calculation: "MRR potencial perdido. No se medirá aún.",
    dataSource: "manual",
    sortOrder: 131,
  },
  {
    name: "Volumen de Bugs (clientes)",
    category: "product_engineering",
    ownerRole: "engineering",
    targetValue: "< 25/mes",
    targetNumeric: 25,
    targetDirection: "below",
    frequency: "weekly",
    unit: "count",
    calculation: "Bugs reportados por clientes en el mes.",
    dataSource: "manual",
    sortOrder: 132,
  },
  {
    name: "Delivery Rate",
    category: "product_engineering",
    ownerRole: "engineering",
    targetValue: "≥ 90% Q4",
    targetNumeric: 90,
    targetDirection: "above",
    frequency: "weekly",
    unit: "%",
    calculation: "% entregas cerradas en la fecha comprometida.",
    dataSource: "manual",
    sortOrder: 133,
  },
  {
    name: "Improvements cerrados / mes",
    category: "product_engineering",
    ownerRole: "engineering",
    targetValue: "≥ 10/mes Q4",
    targetNumeric: 10,
    targetDirection: "above",
    frequency: "weekly",
    unit: "count",
    calculation: "Improvements (no bugs) entregados en el mes.",
    dataSource: "manual",
    sortOrder: 134,
  },

  // PRODUCTO — Glori
  {
    name: "% clientes ≥10 sem activas 90d",
    category: "product_engineering",
    ownerRole: "product",
    targetValue: "≥ 70%",
    targetNumeric: 70,
    targetDirection: "above",
    frequency: "monthly",
    unit: "%",
    calculation: "% clientes nuevos con ≥10 semanas activas en sus primeros 90 días.",
    dataSource: "manual",
    sortOrder: 120,
  },
  {
    name: "% clientes score ≥2/3 d30",
    category: "product_engineering",
    ownerRole: "product",
    targetValue: "≥ 65%",
    targetNumeric: 65,
    targetDirection: "above",
    frequency: "monthly",
    unit: "%",
    calculation: "% clientes nuevos con score ≥2/3 al día 30.",
    dataSource: "manual",
    sortOrder: 121,
  },
];

const KPIS: KPISeed[] = [
  // NORTH STARS / Árbol del MRR (CEO)
  {
    name: "MRR",
    slug: "mrr",
    category: "REVENUE",
    area: "NORTH_STAR",
    baseline: 61144,
    target: 121000,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 1,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "MRR",
    ownerRole: "ceo",
    entries: [
      { period: "2026-05-01", projected: 61144 },
      { period: "2026-06-01", projected: 61144 },
      { period: "2026-07-01", projected: 69972 },
      { period: "2026-08-01", projected: 74130 },
      { period: "2026-09-01", projected: 82640 },
      { period: "2026-10-01", projected: 88868 },
      { period: "2026-11-01", projected: 100082 },
      { period: "2026-12-01", projected: 108451 },
    ],
  },
  {
    name: "NDR",
    slug: "ndr",
    category: "RETENTION",
    area: "NORTH_STAR",
    baseline: 0.9349,
    target: 0.985,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 2,
    isPrincipal: true,
    sourceType: "SCORECARD",
    sourceKey: "NDR",
    ownerRole: "ceo",
    entries: [
      { period: "2026-05-01", projected: 0.9349 },
      { period: "2026-06-01", projected: 0.9349 },
      { period: "2026-07-01", projected: 0.9421 },
      { period: "2026-08-01", projected: 0.9453 },
      { period: "2026-09-01", projected: 0.9554 },
      { period: "2026-10-01", projected: 0.9587 },
      { period: "2026-11-01", projected: 0.9679 },
      { period: "2026-12-01", projected: 0.9707 },
    ],
  },
  {
    name: "CCR (Churn Rate)",
    slug: "ccr",
    category: "RETENTION",
    area: "NORTH_STAR",
    baseline: 0.0689,
    target: 0.027,
    unit: "PCT",
    direction: "BELOW",
    displayOrder: 3,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "CCR",
    ownerRole: "ceo",
    entries: [
      { period: "2026-05-01", projected: 0.0689 },
      { period: "2026-06-01", projected: 0.0689 },
      { period: "2026-07-01", projected: 0.06325 },
      { period: "2026-08-01", projected: 0.0576 },
      { period: "2026-09-01", projected: 0.05195 },
      { period: "2026-10-01", projected: 0.0463 },
      { period: "2026-11-01", projected: 0.04065 },
      { period: "2026-12-01", projected: 0.035 },
    ],
  },

  // COMERCIAL — Fede
  {
    name: "Fit Score del cliente",
    slug: "fit_score",
    category: "GROWTH",
    area: "COMERCIAL",
    baseline: 0.6,
    target: 0.8,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 9,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Fit Score del cliente",
    ownerRole: "sales",
    entries: linearEntries(0.6, 0.8),
  },
  {
    name: "Nuevos clientes / mes",
    slug: "nuevos_clientes_mes",
    category: "GROWTH",
    area: "COMERCIAL",
    baseline: 12.5,
    target: 30,
    unit: "count",
    direction: "ABOVE",
    displayOrder: 10,
    isPrincipal: true,
    sourceType: "SCORECARD",
    sourceKey: "Nuevos clientes / mes",
    ownerRole: "sales",
    entries: linearEntries(12.5, 30),
  },
  {
    name: "New Biz MRR",
    slug: "new_biz_mrr",
    category: "GROWTH",
    area: "COMERCIAL",
    baseline: 6328,
    target: 13560,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 11,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "New Biz MRR",
    ownerRole: "sales",
    entries: [
      { period: "2026-05-01", projected: 6328 },
      { period: "2026-06-01", projected: 6328 },
      { period: "2026-07-01", projected: 7157 },
      { period: "2026-08-01", projected: 7985 },
      { period: "2026-09-01", projected: 8814 },
      { period: "2026-10-01", projected: 9643 },
      { period: "2026-11-01", projected: 10471 },
      { period: "2026-12-01", projected: 11300 },
    ],
  },
  {
    name: "Ticket promedio (ASP)",
    slug: "asp",
    category: "GROWTH",
    area: "COMERCIAL",
    baseline: 450,
    target: 450,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 12,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "ASP (Ticket promedio)",
    ownerRole: "sales",
    entries: flatEntries(450),
  },
  {
    name: "Tasa cierre demo → venta",
    slug: "close_rate",
    category: "EFFICIENCY",
    area: "COMERCIAL",
    baseline: 0.26,
    target: 0.3,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 13,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Tasa cierre demo → venta",
    ownerRole: "sales",
    entries: linearEntries(0.26, 0.3),
  },
  {
    name: "CPL (costo por lead)",
    slug: "cpl",
    category: "EFFICIENCY",
    area: "COMERCIAL",
    baseline: 13.6,
    target: 13,
    unit: "USD",
    direction: "BELOW",
    displayOrder: 14,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "CPL (costo por lead)",
    ownerRole: "sales",
    entries: linearEntries(13.6, 13),
  },
  {
    name: "Deals cerrados / mes (rep)",
    slug: "deals_per_rep",
    category: "EFFICIENCY",
    area: "COMERCIAL",
    baseline: 3,
    target: 5,
    unit: "count",
    direction: "ABOVE",
    displayOrder: 15,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Deals cerrados / mes (rep)",
    ownerRole: "sales",
    entries: linearEntries(3, 5),
  },

  // CUSTOMER SUCCESS — Gaby
  {
    name: "Cuentas activadas / onboard",
    slug: "cuentas_activadas_pct",
    category: "RETENTION",
    area: "CUSTOMER_SUCCESS",
    baseline: 0.7,
    target: 0.9,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 20,
    isPrincipal: true,
    sourceType: "SCORECARD",
    sourceKey: "Cuentas activadas / onboard",
    ownerRole: "cs",
    entries: linearEntries(0.7, 0.9),
  },
  {
    name: "Expansion MRR",
    slug: "expansion_mrr",
    category: "GROWTH",
    area: "CUSTOMER_SUCCESS",
    baseline: 327,
    target: 850,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 21,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Expansion MRR",
    ownerRole: "cs",
    entries: [
      { period: "2026-05-01", projected: 327 },
      { period: "2026-06-01", projected: 327 },
      { period: "2026-07-01", projected: 414 },
      { period: "2026-08-01", projected: 501 },
      { period: "2026-09-01", projected: 589 },
      { period: "2026-10-01", projected: 676 },
      { period: "2026-11-01", projected: 763 },
      { period: "2026-12-01", projected: 850 },
    ],
  },
  {
    name: "Days to Activate",
    slug: "days_to_activate",
    category: "EFFICIENCY",
    area: "CUSTOMER_SUCCESS",
    baseline: 45,
    target: 30,
    unit: "count",
    direction: "BELOW",
    displayOrder: 22,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Days to Activate",
    ownerRole: "cs",
    entries: linearEntries(45, 30),
  },
  {
    name: "Days to Adopt",
    slug: "days_to_adopt",
    category: "EFFICIENCY",
    area: "CUSTOMER_SUCCESS",
    baseline: 90,
    target: 60,
    unit: "count",
    direction: "BELOW",
    displayOrder: 23,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Days to Adopt",
    ownerRole: "cs",
    entries: linearEntries(90, 60),
  },
  {
    name: "Tickets resueltos sin desborde",
    slug: "tickets_sin_desborde",
    category: "EFFICIENCY",
    area: "CUSTOMER_SUCCESS",
    baseline: 2,
    target: 0,
    unit: "count",
    direction: "BELOW",
    displayOrder: 24,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Tickets resueltos sin desborde",
    ownerRole: "cs",
    entries: linearEntries(2, 0),
  },

  // PRODUCTO — Glori
  {
    name: "% clientes ≥10 sem activas en 90d",
    slug: "active_weeks_90d",
    category: "RETENTION",
    area: "PRODUCTO",
    baseline: 0.67,
    target: 0.7,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 30,
    isPrincipal: true,
    sourceType: "SCORECARD",
    sourceKey: "% clientes ≥10 sem activas 90d",
    ownerRole: "product",
    entries: linearEntries(0.67, 0.7),
  },
  {
    name: "% clientes nuevos score ≥2/3 al d30",
    slug: "onboarding_score_d30",
    category: "RETENTION",
    area: "PRODUCTO",
    baseline: 0.6,
    target: 0.65,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 31,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "% clientes score ≥2/3 d30",
    ownerRole: "product",
    entries: linearEntries(0.6, 0.65),
  },

  // INGENIERÍA — Adrián
  {
    name: "MRR en Riesgo",
    slug: "mrr_at_risk",
    category: "RETENTION",
    area: "INGENIERIA",
    baseline: 16429,
    target: 4000,
    unit: "USD",
    direction: "BELOW",
    displayOrder: 40,
    isPrincipal: true,
    sourceType: "SCORECARD",
    sourceKey: "MRR en Riesgo",
    ownerRole: "engineering",
    entries: linearEntries(16429, 4000),
  },
  {
    name: "MRR Potencial",
    slug: "mrr_potencial",
    category: "RETENTION",
    area: "INGENIERIA",
    baseline: 0,
    target: 0,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 41,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "MRR Potencial",
    ownerRole: "engineering",
    entries: flatEntries(0),
  },
  {
    name: "Volumen de bugs (clientes) / mes",
    slug: "bug_volume",
    category: "EFFICIENCY",
    area: "INGENIERIA",
    baseline: 85,
    target: 25,
    unit: "count",
    direction: "BELOW",
    displayOrder: 42,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Volumen de Bugs (clientes)",
    ownerRole: "engineering",
    entries: linearEntries(85, 25),
  },
  {
    name: "TTR bugs (horas)",
    slug: "ttr_hours",
    category: "EFFICIENCY",
    area: "INGENIERIA",
    baseline: 43.9,
    target: 24,
    unit: "count",
    direction: "BELOW",
    displayOrder: 43,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Time to Resolution de Urgentes",
    ownerRole: "engineering",
    entries: linearEntries(43.9, 24),
  },
  {
    name: "Delivery Rate (entregas en fecha)",
    slug: "delivery_rate",
    category: "EFFICIENCY",
    area: "INGENIERIA",
    baseline: 0.65,
    target: 0.9,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 44,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Delivery Rate",
    ownerRole: "engineering",
    entries: linearEntries(0.65, 0.9),
  },
  {
    name: "Improvements cerrados / mes",
    slug: "improvements_closed",
    category: "EFFICIENCY",
    area: "INGENIERIA",
    baseline: 3,
    target: 10,
    unit: "count",
    direction: "ABOVE",
    displayOrder: 45,
    isPrincipal: false,
    sourceType: "SCORECARD",
    sourceKey: "Improvements cerrados / mes",
    ownerRole: "engineering",
    entries: linearEntries(3, 10),
  },
];

const ACTIONS: ActionSeed[] = [
  // COMERCIAL — Fede
  {
    area: "COMERCIAL",
    ownerRole: "sales",
    title: "IA para proceso SDR",
    expectedImpact: "Mayor volumen de prospección sin aumentar headcount.",
    displayOrder: 1,
  },
  {
    area: "COMERCIAL",
    ownerRole: "sales",
    title: "Contratar perfiles outbound consultivo",
    expectedImpact:
      "Vendedores que entienden el sector y saben hacer outbound agresivo.",
    displayOrder: 2,
  },
  {
    area: "COMERCIAL",
    ownerRole: "sales",
    title: "Full ciclo inbound + outbound activo",
    expectedImpact:
      "LinkedIn Sales Navigator y secuencias automatizadas operativas todo el semestre.",
    displayOrder: 3,
  },
  {
    area: "COMERCIAL",
    ownerRole: "sales",
    title: "KPIs de actividad diaria y semanal por rep",
    expectedImpact: "Visibilidad en tiempo real del desempeño individual.",
    displayOrder: 4,
  },
  {
    area: "COMERCIAL",
    ownerRole: "sales",
    title: "Escalar contenido de marketing y campañas segmentadas",
    expectedImpact:
      "Calidad del lead mejora; ciclo de venta se acorta.",
    displayOrder: 5,
  },

  // CUSTOMER SUCCESS — Gaby
  {
    area: "CUSTOMER_SUCCESS",
    ownerRole: "cs",
    title: "División activación / adopción / success",
    expectedImpact:
      "30d activar, 30–60d adoptar, luego pase a Success — claridad en el journey.",
    displayOrder: 1,
  },
  {
    area: "CUSTOMER_SUCCESS",
    ownerRole: "cs",
    title: "Health Score activo en Agency",
    expectedImpact: "Menos cuentas críticas y en riesgo sin detectar.",
    displayOrder: 2,
  },
  {
    area: "CUSTOMER_SUCCESS",
    ownerRole: "cs",
    title: "Sesiones de monitoreo y escalamiento preventivo",
    expectedImpact:
      "Detectar señales de churn antes de que el cliente avise.",
    displayOrder: 3,
  },
  {
    area: "CUSTOMER_SUCCESS",
    ownerRole: "cs",
    title: "Usage Score automatizado → acciones sobre score <70",
    expectedImpact: "Intervención proactiva en clientes con bajo uso.",
    displayOrder: 4,
  },
  {
    area: "CUSTOMER_SUCCESS",
    ownerRole: "cs",
    title: "Detección de upselling en implementación y success",
    expectedImpact: "Expansion MRR desde la cartera existente.",
    displayOrder: 5,
  },

  // PRODUCTO — Glori
  {
    area: "PRODUCTO",
    ownerRole: "product",
    title: "Lanzar Control de Materiales + Centro de Pagos",
    expectedImpact:
      "Eliminar los 2 bloqueos principales en implementaciones activas.",
    displayOrder: 1,
  },
  {
    area: "PRODUCTO",
    ownerRole: "product",
    title: "Contratar PM senior",
    expectedImpact: "Duplicar la capacidad de ejecución de producto.",
    displayOrder: 2,
  },
  {
    area: "PRODUCTO",
    ownerRole: "product",
    title: "Journey maps por tipo de cliente",
    expectedImpact:
      "Guía para definir dónde y cómo intervenir con experimentos.",
    displayOrder: 3,
  },
  {
    area: "PRODUCTO",
    ownerRole: "product",
    title: "Experimentos de usabilidad en flujos recurrentes",
    expectedImpact:
      "Que los clientes nuevos formen hábito en sus primeros 90d.",
    displayOrder: 4,
  },
  {
    area: "PRODUCTO",
    ownerRole: "product",
    title: "Sistema de feedback organizado",
    expectedImpact:
      "Decisiones de roadmap más informadas y más rápidas.",
    displayOrder: 5,
  },

  // INGENIERÍA — Adrián
  {
    area: "INGENIERIA",
    ownerRole: "engineering",
    title: "Reducir bugs que llegan al cliente (causa raíz)",
    expectedImpact:
      "Baja el MRR en riesgo y reduce churn por calidad.",
    displayOrder: 1,
  },
  {
    area: "INGENIERIA",
    ownerRole: "engineering",
    title: "Reducir TTR con pre-análisis automático",
    expectedImpact:
      "Menor MTTR y menor tiempo de interrupción para clientes.",
    displayOrder: 2,
  },
  {
    area: "INGENIERIA",
    ownerRole: "engineering",
    title: "Reordenar proceso y medir impacto individual",
    expectedImpact:
      "Más trazabilidad, menos retrabajo, mejor calidad.",
    displayOrder: 3,
  },
  {
    area: "INGENIERIA",
    ownerRole: "engineering",
    title: "Sumar 1 developer + 1 QA/tester formalizado",
    expectedImpact:
      "Mayor capacidad, menos regresiones, menos dependencia crítica.",
    displayOrder: 4,
  },
  {
    area: "INGENIERIA",
    ownerRole: "engineering",
    title: "Automatizar alertas, diagnóstico y tickets Linear",
    expectedImpact:
      "Detección temprana y foco del equipo en causas raíz.",
    displayOrder: 5,
  },
];

const RISKS: RiskSeed[] = [
  {
    area: "COMERCIAL",
    title: "Contratar mal",
    description:
      "Vendedores sin perfil outbound o sin conocimiento del sector alargan la curva y no cierran.",
    displayOrder: 1,
  },
  {
    area: "COMERCIAL",
    title: "Ciclo de venta más largo por outbound",
    description:
      "El pipeline tarda más en madurar; presión sobre los números de corto plazo.",
    displayOrder: 2,
  },
  {
    area: "COMERCIAL",
    title: "Churn supera la retención",
    description:
      "Si no se contiene la fuga del MRR, el esfuerzo comercial no se ve en el MRR neto.",
    displayOrder: 3,
  },

  {
    area: "CUSTOMER_SUCCESS",
    title: "Datos PostHog inconsistentes",
    description:
      "Dashboards de uso a veces fallan; dependencia de soporte técnico para actualizarlos.",
    displayOrder: 1,
  },
  {
    area: "CUSTOMER_SUCCESS",
    title: "Desalineación con ventas en CRM",
    description:
      "El equipo de ventas no sabe dónde encontrar información en Agency; fricción en el handoff.",
    displayOrder: 2,
  },
  {
    area: "CUSTOMER_SUCCESS",
    title: "Sin proceso de escalamiento inter-áreas",
    description:
      "Cuando un cliente está en riesgo, no hay ruta clara hacia producto, ingeniería o ventas.",
    displayOrder: 3,
  },

  {
    area: "PRODUCTO",
    title: "Señal poco clara en experimentos",
    description:
      "Difícil aislar el impacto de cada proyecto en los KPIs.",
    displayOrder: 1,
  },
  {
    area: "PRODUCTO",
    title: "Deuda funcional más profunda de lo esperado",
    description:
      "Gaps en módulos fuera del roadmap con impacto negativo en clientes que hoy no tenemos identificados.",
    displayOrder: 2,
  },
  {
    area: "PRODUCTO",
    title: "Factores externos en la implementación",
    description:
      "La disposición del cliente y su colaboración con CS está fuera de nuestro control.",
    displayOrder: 3,
  },

  {
    area: "INGENIERIA",
    title: "El volumen de bugs no baja",
    description:
      "Si seguimos en ~85 bugs/mes, el equipo sigue en modo reactivo y no puede avanzar.",
    displayOrder: 1,
  },
  {
    area: "INGENIERIA",
    title: "La capacidad nueva llega tarde o no se consolida",
    description:
      "El developer y QA necesitan incorporarse y aportar antes de Q4.",
    displayOrder: 2,
  },
  {
    area: "INGENIERIA",
    title: "Brecha diseño-producto-implementación",
    description:
      "Funcionalidades llegan a desarrollo con gaps de diseño o requisitos incompletos → retrabajo y más bugs.",
    displayOrder: 3,
  },
];

export async function seedPlanH2() {
  const plan = await prisma.plan.upsert({
    where: { name: PLAN.name },
    update: {
      type: PLAN.type,
      startDate: new Date(PLAN.startDate),
      endDate: new Date(PLAN.endDate),
      status: PLAN.status,
    },
    create: {
      name: PLAN.name,
      type: PLAN.type,
      startDate: new Date(PLAN.startDate),
      endDate: new Date(PLAN.endDate),
      status: PLAN.status,
    },
  });

  await prisma.quarter.updateMany({
    where: {
      planId: null,
      OR: [
        { year: 2026, quarter: 3 },
        { year: 2026, quarter: 4 },
      ],
    },
    data: { planId: plan.id },
  });

  const ownersByRole = new Map<OwnerRole, string>();
  for (const role of ["ceo", "sales", "cs", "product", "engineering"] as OwnerRole[]) {
    const user = await prisma.user.findFirst({ where: { role } });
    if (user) ownersByRole.set(role, user.id);
  }

  // While HubSpot/PostHog sync routes don't write to ScorecardEntry yet,
  // treat those metrics as manual so owners can update them by hand.
  await prisma.scorecardMetric.updateMany({
    where: { dataSource: { in: ["hubspot", "posthog"] } },
    data: { dataSource: "manual" },
  });

  // Idempotent renames before upserting scorecard metrics.
  for (const rename of SCORECARD_RENAMES) {
    const old = await prisma.scorecardMetric.findFirst({ where: { name: rename.from } });
    if (!old) continue;
    const newer = await prisma.scorecardMetric.findFirst({ where: { name: rename.to } });
    if (newer) {
      await prisma.scorecardEntry.deleteMany({ where: { metricId: old.id } });
      await prisma.scorecardMetric.delete({ where: { id: old.id } });
    } else {
      await prisma.scorecardMetric.update({
        where: { id: old.id },
        data: { name: rename.to },
      });
    }
  }

  // Upsert Scorecard metrics that back area Plan KPIs.
  for (const metric of SCORECARD_METRICS) {
    const ownerId = ownersByRole.get(metric.ownerRole);
    if (!ownerId) {
      console.warn(
        `[seed:planH2] No user found for scorecard metric ${metric.name} (role=${metric.ownerRole})`
      );
      continue;
    }
    const existing = await prisma.scorecardMetric.findFirst({
      where: { name: metric.name },
    });
    if (existing) {
      await prisma.scorecardMetric.update({
        where: { id: existing.id },
        data: {
          category: metric.category,
          ownerId,
          targetValue: metric.targetValue,
          targetNumeric: metric.targetNumeric,
          targetDirection: metric.targetDirection,
          frequency: metric.frequency,
          unit: metric.unit,
          calculation: metric.calculation,
          dataSource: metric.dataSource,
          sortOrder: metric.sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.scorecardMetric.create({
        data: {
          name: metric.name,
          category: metric.category,
          ownerId,
          targetValue: metric.targetValue,
          targetNumeric: metric.targetNumeric,
          targetDirection: metric.targetDirection,
          frequency: metric.frequency,
          unit: metric.unit,
          calculation: metric.calculation,
          dataSource: metric.dataSource,
          sortOrder: metric.sortOrder,
          isActive: true,
        },
      });
    }
  }

  const activeSlugs = new Set(KPIS.map((k) => k.slug));

  // Delete PlanKPIs (and cascade entries) that are no longer part of the plan.
  await prisma.planKPI.deleteMany({
    where: {
      planId: plan.id,
      slug: { notIn: Array.from(activeSlugs) },
    },
  });

  for (const kpi of KPIS) {
    const ownerId = ownersByRole.get(kpi.ownerRole);
    if (!ownerId) {
      console.warn(`[seed:planH2] No user found with role=${kpi.ownerRole}; skipping ${kpi.slug}`);
      continue;
    }

    const created = await prisma.planKPI.upsert({
      where: { planId_slug: { planId: plan.id, slug: kpi.slug } },
      update: {
        name: kpi.name,
        category: kpi.category,
        area: kpi.area,
        baseline: kpi.baseline,
        target: kpi.target,
        unit: kpi.unit,
        direction: kpi.direction,
        ownerId,
        sourceType: kpi.sourceType,
        sourceKey: kpi.sourceKey,
        displayOrder: kpi.displayOrder,
        isPrincipal: kpi.isPrincipal,
      },
      create: {
        planId: plan.id,
        name: kpi.name,
        slug: kpi.slug,
        category: kpi.category,
        area: kpi.area,
        baseline: kpi.baseline,
        target: kpi.target,
        unit: kpi.unit,
        direction: kpi.direction,
        ownerId,
        sourceType: kpi.sourceType,
        sourceKey: kpi.sourceKey,
        displayOrder: kpi.displayOrder,
        isPrincipal: kpi.isPrincipal,
      },
    });

    for (const entry of kpi.entries) {
      await prisma.planKPIEntry.upsert({
        where: { kpiId_period: { kpiId: created.id, period: new Date(entry.period) } },
        update: { projected: entry.projected },
        create: {
          kpiId: created.id,
          period: new Date(entry.period),
          projected: entry.projected,
        },
      });
    }
  }

  // One-time migration: copy existing PlanKPIEntry.actual values (populated by
  // previous ChartMogul syncs) over to ScorecardEntry, so historical data
  // doesn't disappear when these KPIs switch source to SCORECARD.
  const quarters = await prisma.quarter.findMany();
  function findQuarterForDate(d: Date): string | undefined {
    return quarters.find((q) => d >= q.startDate && d <= q.endDate)?.id;
  }
  for (const m of CHARTMOGUL_SCORECARD_METRICS) {
    const metric = await prisma.scorecardMetric.findFirst({ where: { name: m.name } });
    if (!metric) continue;
    const planKpi = await prisma.planKPI.findFirst({
      where: { planId: plan.id, slug: m.slug },
      include: { entries: true },
    });
    if (!planKpi) continue;

    for (const entry of planKpi.entries) {
      if (entry.actual === null) continue;
      const periodStart = new Date(
        Date.UTC(entry.period.getUTCFullYear(), entry.period.getUTCMonth(), 1)
      );
      const periodEnd = new Date(
        Date.UTC(entry.period.getUTCFullYear(), entry.period.getUTCMonth() + 1, 0)
      );
      const quarterId = findQuarterForDate(periodStart);
      if (!quarterId) continue;
      const value = m.isPct ? entry.actual * 100 : entry.actual;
      await prisma.scorecardEntry.upsert({
        where: { metricId_periodStart: { metricId: metric.id, periodStart } },
        update: { actualValue: value, autoSynced: true },
        create: {
          metricId: metric.id,
          quarterId,
          periodStart,
          periodEnd,
          actualValue: value,
          autoSynced: true,
          status: "on_track",
        },
      });
    }
  }

  await prisma.planAction.deleteMany({ where: { planId: plan.id } });
  for (const action of ACTIONS) {
    const ownerId = ownersByRole.get(action.ownerRole) ?? null;
    await prisma.planAction.create({
      data: {
        planId: plan.id,
        area: action.area,
        ownerId,
        title: action.title,
        expectedImpact: action.expectedImpact,
        displayOrder: action.displayOrder,
      },
    });
  }

  await prisma.planRisk.deleteMany({ where: { planId: plan.id } });
  for (const risk of RISKS) {
    await prisma.planRisk.create({
      data: {
        planId: plan.id,
        area: risk.area,
        title: risk.title,
        description: risk.description,
        displayOrder: risk.displayOrder,
      },
    });
  }

  console.log(
    `[seed:planH2] Plan "${plan.name}" seeded with ${KPIS.length} KPIs, ${ACTIONS.length} actions, ${RISKS.length} risks.`
  );
  return plan;
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("planH2.ts");

if (isDirectRun) {
  seedPlanH2()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
