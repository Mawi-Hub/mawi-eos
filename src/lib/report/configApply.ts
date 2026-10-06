// Aplica la configuración del reporte (áreas, selección trimestral, mapeos)
// desde un JSON. Es aditivo e idempotente: crea o actualiza filas del reporte,
// nunca borra datos, nunca toca roles/permisos y nunca ejecuta seeds. Una
// definición ya aprobada no se pisa salvo con force.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hasBlockingIssues, validateSelection, type CandidateRow, type ValidationIssue } from "@/lib/selection/validate";

export type ReportConfig = {
  quarter: { year: number; quarter: number; objective?: string | null };
  plan: { name: string };
  areas: Array<{ key: string; name: string; leaderEmail?: string | null; alternateEmail?: string | null; sortOrder?: number }>;
  members?: Array<{ areaKey: string; displayName: string; email?: string | null; slackUserId?: string | null; slackWorkspaceId?: string | null; isLeader?: boolean; verified?: boolean }>;
  principalRocks?: Record<string, string | null>;
  selections: Array<{
    areaKey: string;
    order?: number;
    label?: string;
    ref: { planKpiSlug?: string; scorecardMetricName?: string; proposalKey?: string };
    approvalStatus?: "pending" | "approved";
    definition?: Record<string, unknown>;
  }>;
};

export type ApplyReport = {
  apply: boolean;
  actions: string[];
  review: string[];
  issues: ValidationIssue[];
};

export async function applyReportConfig(config: ReportConfig, options: { apply: boolean; force?: boolean }): Promise<ApplyReport> {
  const report: ApplyReport = { apply: options.apply, actions: [], review: [], issues: [] };
  const act = (m: string) => report.actions.push(m);

  const plan = await prisma.plan.findUnique({ where: { name: config.plan.name } });
  if (!plan) throw new Error(`No existe el plan "${config.plan.name}"`);
  const quarter = await prisma.quarter.findUnique({ where: { year_quarter: { year: config.quarter.year, quarter: config.quarter.quarter } } });
  if (!quarter) throw new Error(`No existe el trimestre Q${config.quarter.quarter} ${config.quarter.year}`);

  // Usuarios por email (sin inferir por nombre).
  const emails = [...new Set([...config.areas.flatMap((a) => [a.leaderEmail, a.alternateEmail]), ...(config.members ?? []).map((m) => m.email)].filter((e): e is string => !!e))];
  const users = emails.length ? await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } }) : [];
  const userByEmail = new Map(users.map((u) => [u.email, u.id]));
  for (const e of emails) if (!userByEmail.has(e)) report.review.push(`Sin usuario en el app para ${e}: queda sin asignar (no se infiere por nombre).`);

  // Áreas
  const areaIds = new Map<string, string>();
  for (const a of config.areas) {
    const leaderId = a.leaderEmail ? userByEmail.get(a.leaderEmail) ?? null : null;
    const alternateId = a.alternateEmail ? userByEmail.get(a.alternateEmail) ?? null : null;
    const existing = await prisma.reportArea.findUnique({ where: { key: a.key } });
    act(`${existing ? "actualizar" : "crear"} área ${a.key} (líder: ${a.leaderEmail ?? "sin asignar"})`);
    if (options.apply) {
      const row = await prisma.reportArea.upsert({
        where: { key: a.key },
        update: { name: a.name, sortOrder: a.sortOrder ?? 0, leaderId, alternateId },
        create: { key: a.key, name: a.name, sortOrder: a.sortOrder ?? 0, leaderId, alternateId },
      });
      areaIds.set(a.key, row.id);
    } else if (existing) areaIds.set(a.key, existing.id);
    else areaIds.set(a.key, `dry:${a.key}`);
  }

  // Trimestre ↔ plan y objetivo (solo si faltan).
  if (!quarter.planId || quarter.planId !== plan.id) {
    act(`vincular Q${quarter.quarter} ${quarter.year} al plan ${plan.name}`);
    if (options.apply) await prisma.quarter.update({ where: { id: quarter.id }, data: { planId: plan.id } });
  }
  if (config.quarter.objective && !quarter.objective) {
    act("fijar el objetivo del trimestre");
    if (options.apply) await prisma.quarter.update({ where: { id: quarter.id }, data: { objective: config.quarter.objective } });
  }

  // Miembros del roster (identidad pendiente de verificar salvo indicación).
  for (const m of config.members ?? []) {
    const areaId = areaIds.get(m.areaKey);
    if (!areaId) { report.review.push(`Miembro ${m.displayName}: área ${m.areaKey} no existe`); continue; }
    if (!m.slackUserId && !m.email) { report.review.push(`Miembro ${m.displayName}: sin slackUserId ni email, pendiente de mapeo`); }
    act(`roster: ${m.displayName} → ${m.areaKey} (${m.verified ? "verificado" : "pendiente de verificar"})`);
    if (options.apply && !areaId.startsWith("dry:")) {
      const userId = m.email ? userByEmail.get(m.email) ?? null : null;
      const existing = m.slackUserId ? await prisma.reportMember.findFirst({ where: { slackUserId: m.slackUserId, areaId, validTo: null } }) : null;
      const data = { areaId, userId, displayName: m.displayName, slackUserId: m.slackUserId ?? null, slackWorkspaceId: m.slackWorkspaceId ?? null, identityVerified: m.verified === true, isLeader: m.isLeader === true };
      if (existing) await prisma.reportMember.update({ where: { id: existing.id }, data });
      else await prisma.reportMember.create({ data });
    }
  }

  // Mapeo canónico PlanKPI → ScorecardMetric: solo cuando es inequívoco.
  const kpis = await prisma.planKPI.findMany({ where: { planId: plan.id }, select: { id: true, slug: true, name: true, planId: true, unit: true, direction: true, sourceType: true, sourceKey: true, scorecardMetricId: true } });
  const allMetrics = await prisma.scorecardMetric.findMany({ select: { id: true, name: true, unit: true, targetDirection: true } });
  const metricsByName = new Map<string, typeof allMetrics>();
  for (const m of allMetrics) metricsByName.set(m.name, [...(metricsByName.get(m.name) ?? []), m]);
  for (const k of kpis) {
    if (k.scorecardMetricId || k.sourceType !== "SCORECARD" || !k.sourceKey) continue;
    const found = metricsByName.get(k.sourceKey) ?? [];
    if (found.length === 1) {
      act(`mapear KPI ${k.slug} → métrica "${found[0].name}"`);
      if (options.apply) await prisma.planKPI.update({ where: { id: k.id }, data: { scorecardMetricId: found[0].id } });
      k.scorecardMetricId = found[0].id;
    } else {
      report.review.push(`KPI ${k.slug}: correspondencia ${found.length === 0 ? "sin métrica" : "ambigua (" + found.length + " métricas)"} con "${k.sourceKey}"; queda para revisión.`);
    }
  }

  // Selección trimestral.
  const rows: CandidateRow[] = [];
  const plans: Array<{ sel: ReportConfig["selections"][number]; planKpiId: string | null; scorecardMetricId: string | null; proposalKey: string | null }> = [];
  for (const sel of config.selections) {
    const key = `${sel.areaKey}:${sel.label ?? JSON.stringify(sel.ref)}`;
    let planKpi: (typeof kpis)[number] | undefined;
    let metric: (typeof allMetrics)[number] | undefined;
    if (sel.ref.planKpiSlug) {
      planKpi = kpis.find((k) => k.slug === sel.ref.planKpiSlug);
      if (!planKpi) { report.review.push(`${key}: no existe el KPI ${sel.ref.planKpiSlug}`); continue; }
      metric = allMetrics.find((m) => m.id === planKpi!.scorecardMetricId);
    }
    if (sel.ref.scorecardMetricName) {
      const found = metricsByName.get(sel.ref.scorecardMetricName) ?? [];
      if (found.length !== 1) {
        report.review.push(`${key}: la métrica "${sel.ref.scorecardMetricName}" ${found.length === 0 ? "no existe" : "es ambigua (" + found.length + ")"}; queda como definición pendiente de configuración.`);
      } else metric = found[0];
    }
    const proposalKey = sel.ref.proposalKey ?? (!planKpi && !metric ? `${sel.areaKey}_${(sel.label ?? "metrica").toLowerCase().replace(/[^a-z0-9]+/g, "_")}` : null);
    rows.push({
      key,
      quarterPlanId: plan.id,
      planKpi: planKpi ? { id: planKpi.id, planId: planKpi.planId, scorecardMetricId: planKpi.scorecardMetricId, unit: planKpi.unit, direction: planKpi.direction } : null,
      scorecardMetric: metric ? { id: metric.id, unit: metric.unit, targetDirection: metric.targetDirection } : null,
      proposalKey,
    });
    plans.push({ sel, planKpiId: planKpi?.id ?? null, scorecardMetricId: planKpi ? null : metric?.id ?? null, proposalKey: planKpi || metric ? null : proposalKey });
  }
  report.issues = validateSelection(rows);
  if (hasBlockingIssues(report.issues)) return report;

  for (const p of plans) {
    const areaId = areaIds.get(p.sel.areaKey);
    if (!areaId) { report.review.push(`Selección ${p.sel.label}: área ${p.sel.areaKey} no existe`); continue; }
    const where: Prisma.QuarterMetricSelectionWhereInput = {
      quarterId: quarter.id,
      ...(p.planKpiId ? { planKpiId: p.planKpiId } : p.scorecardMetricId ? { scorecardMetricId: p.scorecardMetricId } : { proposalKey: p.proposalKey }),
    };
    const existing = await prisma.quarterMetricSelection.findFirst({ where });
    const keepApproved = existing?.approvalStatus === "approved" && !options.force;
    act(`${existing ? (keepApproved ? "conservar (ya aprobada)" : "actualizar") : "crear"} selección ${p.sel.areaKey} · ${p.sel.label ?? "métrica"} [${p.sel.approvalStatus ?? "pending"}]`);
    if (!options.apply || areaId.startsWith("dry:") || keepApproved) continue;
    const data = {
      planId: plan.id,
      quarterId: quarter.id,
      areaId,
      planKpiId: p.planKpiId,
      scorecardMetricId: p.scorecardMetricId,
      proposalKey: p.proposalKey,
      displayLabel: p.sel.label ?? null,
      sortOrder: p.sel.order ?? 0,
      approvalStatus: p.sel.approvalStatus ?? "pending",
      definition: (p.sel.definition ?? {}) as Prisma.InputJsonValue,
    };
    if (existing) await prisma.quarterMetricSelection.update({ where: { id: existing.id }, data });
    else await prisma.quarterMetricSelection.create({ data });
  }

  // Rock principal por área (por título exacto; nunca por parecido).
  for (const [areaKey, title] of Object.entries(config.principalRocks ?? {})) {
    if (!title) continue;
    const areaId = areaIds.get(areaKey);
    const rocks = await prisma.rock.findMany({ where: { quarterId: quarter.id, title } });
    if (!areaId || rocks.length !== 1) { report.review.push(`Rock principal de ${areaKey}: "${title}" ${rocks.length === 0 ? "no existe" : "es ambiguo"}`); continue; }
    act(`Rock principal ${areaKey} → "${title}"`);
    if (options.apply && !areaId.startsWith("dry:")) {
      await prisma.areaQuarterConfig.upsert({
        where: { quarterId_areaId: { quarterId: quarter.id, areaId } },
        update: { principalRockId: rocks[0].id },
        create: { quarterId: quarter.id, areaId, principalRockId: rocks[0].id },
      });
    }
  }
  return report;
}
