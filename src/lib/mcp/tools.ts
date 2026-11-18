// Herramientas de solo lectura del MCP de EOS. Cada una cubre un dominio con
// filtros en términos de negocio (trimestre, persona, fechas) y devuelve JSON
// con nombres resueltos, para que el modelo no tenga que unir tablas.
//
// Exclusiones deliberadas: password_hash nunca sale, y la energía del check-in
// del equipo solo se devuelve agregada por semana (es el acuerdo con el equipo).
import { prisma } from "@/lib/db";
import { crMidnight, crWeekStart } from "@/lib/time/costaRica";
import { ToolInputError, type JsonSchema, type McpTool } from "./protocol";

type Args = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function str(a: Args, k: string): string | undefined {
  const v = a[k];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function bool(a: Args, k: string): boolean {
  const v = a[k];
  return v === true || v === "true";
}

function limitOf(a: Args, def = 100): number {
  const v = Number(a.limite);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), 500) : def;
}

// AAAA-MM-DD se interpreta como medianoche de Costa Rica; cualquier otro ISO
// se respeta tal cual.
export function parseDate(value: string, field: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? crMidnight(Number(m[1]), Number(m[2]), Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) throw new ToolInputError(`${field}: fecha inválida "${value}" (usá AAAA-MM-DD)`);
  return d;
}

// Rango [desde, hasta] inclusivo: "hasta" de solo fecha cubre el día entero.
function range(a: Args): { gte?: Date; lt?: Date } | undefined {
  const desde = str(a, "desde");
  const hasta = str(a, "hasta");
  if (!desde && !hasta) return undefined;
  const r: { gte?: Date; lt?: Date } = {};
  if (desde) r.gte = parseDate(desde, "desde");
  if (hasta) {
    const end = parseDate(hasta, "hasta");
    r.lt = /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? new Date(end.getTime() + 86_400_000) : end;
  }
  return r;
}

// "2026-Q4", "Q4 2026", "Q4-2026" → { year, quarter }.
export function parseQuarter(value: string): { year: number; quarter: number } | null {
  const a = /^(\d{4})\s*[-\s]?\s*Q([1-4])$/i.exec(value);
  if (a) return { year: Number(a[1]), quarter: Number(a[2]) };
  const b = /^Q([1-4])\s*[-\s]?\s*(\d{4})$/i.exec(value);
  if (b) return { year: Number(b[2]), quarter: Number(b[1]) };
  return null;
}

// Devuelve el id del trimestre, o undefined si se piden todos.
async function quarterId(a: Args, defaultActive: boolean): Promise<string | undefined> {
  const raw = str(a, "trimestre")?.toLowerCase();
  if (raw === "todos") return undefined;
  if (!raw && !defaultActive) return undefined;
  if (!raw || raw === "activo") {
    const q = await prisma.quarter.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!q) throw new ToolInputError("No hay un trimestre activo. Pasá trimestre (p. ej. 2026-Q4) o \"todos\".");
    return q.id;
  }
  const parsed = parseQuarter(raw);
  if (!parsed) throw new ToolInputError(`trimestre inválido "${raw}". Formato: 2026-Q4, "activo" o "todos".`);
  const q = await prisma.quarter.findUnique({ where: { year_quarter: parsed }, select: { id: true } });
  if (!q) throw new ToolInputError(`No existe el trimestre ${parsed.year}-Q${parsed.quarter}.`);
  return q.id;
}

// Cómo se le dice a cada quien en el día a día.
const NICKNAMES: Record<string, string> = { gaby: "gabriela", glory: "gloriana", fede: "federico", adri: "adrian" };

// Persona por nombre, apodo o email (contiene, sin mayúsculas). Devuelve ids.
async function personIds(a: Args): Promise<string[] | undefined> {
  const q = str(a, "persona");
  if (!q) return undefined;
  const term = NICKNAMES[q.toLowerCase()] ?? q;
  const users = await prisma.user.findMany({
    where: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] },
    select: { id: true },
  });
  if (!users.length) {
    const all = await prisma.user.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    throw new ToolInputError(`No encontré a "${q}". Personas: ${all.map((u) => u.name).join(", ")}.`);
  }
  return users.map((u) => u.id);
}

const qLabel = (q: { year: number; quarter: number }) => `${q.year}-Q${q.quarter}`;
const userSel = { select: { id: true, name: true } } as const;

// ---------------------------------------------------------------------------
// Esquemas reutilizables
// ---------------------------------------------------------------------------

const P = {
  trimestre: { type: "string", description: 'Trimestre: "2026-Q4", "activo" o "todos".' },
  persona: { type: "string", description: "Nombre o email (coincidencia parcial). Ej.: Gaby, fede@." },
  desde: { type: "string", description: "Fecha inicial inclusiva, AAAA-MM-DD (hora de Costa Rica)." },
  hasta: { type: "string", description: "Fecha final inclusiva, AAAA-MM-DD (hora de Costa Rica)." },
  limite: { type: "number", description: "Máximo de filas (por defecto 100, tope 500)." },
} as const;

function schema(properties: Record<string, unknown>, required: string[] = []): JsonSchema {
  return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

// ---------------------------------------------------------------------------
// Guía
// ---------------------------------------------------------------------------

export const GUIDE = `# EOS de Mawi — guía de datos

Sistema EOS-lite del equipo de liderazgo de Mawi. Horario de referencia: Costa Rica (America/Costa_Rica).
Todo lo que devuelven estas herramientas es de solo lectura y sale de la base de la app (fuente de verdad; Notion es solo una proyección).

## Conceptos
- **Trimestre (Quarter)**: año + Q1–Q4. Uno está activo (isActive). Muchas herramientas aceptan trimestre = "2026-Q4" | "activo" | "todos".
- **Rocks**: prioridades trimestrales por persona. status: on_track, off_track, riesgo, done, not_done. finalStatus se fija al cierre del trimestre. progress 0–100.
- **Scorecard**: métricas (ScorecardMetric) con dueño, meta (targetNumeric + targetDirection above/below/equal), frecuencia y fuente (manual, chartmogul, hubspot, posthog). Entradas por período con actualValue, expectedValue (lo esperado ese período según el plan) y status on_track/off_track/riesgo/pending. dataState explica valores no normales (confirmed_zero, pending, not_applicable, no_sample, stale, error). Porcentajes: ver percentScale ("0-100" o "0-1").
- **Selección de métricas del trimestre**: la lista oficial de métricas por área y trimestre (plan, scorecard, L10 y check-ins la leen). approvalStatus pending = todavía no se evalúa.
- **Wins y retos (WinChallenge)**: reportes de líderes. entryType win|challenge; priority alto/medio/bajo para retos.
- **L10**: reunión semanal de liderazgo (60 min, viernes). status upcoming/in_progress/completed; phase preread → voting → ids → commitments → closed. Gaby facilita.
  - **Issues (IDS)**: idsStatus identify → discuss → solve → resolved. Pueden ligarse a un Rock o métrica. Votos = dot voting. Máximo 3 por persona (los temas del equipo, teamThemeId, no cuentan). shareable/sharedSummary = lo que sale al resumen de empresa.
  - **Compromisos**: status open | done | pending (revisado y sigue abierto). dueDate puede moverse; originalDueDate no; dateChanges guarda cada cambio con motivo. accepted=false = propuesto, aún no asumido.
  - **Anotaciones**: comentarios del pre-read sobre rock/métrica/win/reto, tag clarificar|discutir.
  - **Coverage**: cada métrica o rock en rojo debe quedar cubierto por un issue (linked_issue) o una nota sin acción.
  - **Preparación de líderes (LeaderPrep)**: por reunión y área, draft|confirmed, con bloques rock/scorecard/wins/agreements/ids.
  - **Reportes de reunión (MeetingReport)**: snapshot inmutable del resumen al cerrar; version sube si cambia lo compartible.
- **Check-ins**:
  - Del equipo (TeamCheckin): formulario semanal en Slack (jueves 15:00), por persona: result, learning, blocker, commitment y cómo terminó el compromiso anterior. periodStart = lunes 00:00 CR de la semana. La energía (1–5) solo se expone agregada por semana.
  - Evidencia (CheckinEvidence): el texto original de cada respuesta con win/challenge extraídos y permalink de Slack.
- **Resumen semanal (WeeklySummary)**: borrador y envío a #weekly-check-ins; teamThemes = temas que se repiten en el check-in del equipo.
- **Plan**: plan anual/semestral con KPIs (baseline, target, entradas mensuales projected vs actual), acciones, riesgos y propuestas por área.
- **Áreas de reporte**: ventas, growth, customer, producto, ingenieria, con líder, alterno y miembros (teamKey define qué check-in recibe cada persona).

## Consejos
- Para "cómo vamos": rocks + scorecard del trimestre activo.
- Para "qué quedó de la última L10": l10_reuniones (limite 1) y luego l10_reunion con ese id.
- Para pendientes de alguien: compromisos con persona y estado "vencidos" o "open", más issues con estado "abiertos".
`;

// ---------------------------------------------------------------------------
// Herramientas
// ---------------------------------------------------------------------------

export const eosTools: McpTool[] = [
  {
    name: "guia",
    title: "Guía de datos",
    description: "Definiciones, estados y cómo leer los datos de EOS. Llamala antes de la primera consulta.",
    inputSchema: schema({}),
    handler: async () => GUIDE,
  },
  {
    name: "personas",
    title: "Personas, roles y áreas",
    description: "Usuarios (rol, facilitador), accountability chart y áreas de reporte con líder, alterno y miembros vigentes.",
    inputSchema: schema({}),
    handler: async () => {
      const now = new Date();
      const [users, areas] = await Promise.all([
        prisma.user.findMany({
          select: { id: true, name: true, email: true, role: true, isFacilitator: true, accountabilityRole: true },
          orderBy: { name: "asc" },
        }),
        prisma.reportArea.findMany({
          orderBy: { sortOrder: "asc" },
          include: {
            leader: userSel,
            alternate: userSel,
            members: {
              where: { OR: [{ validTo: null }, { validTo: { gt: now } }] },
              select: { displayName: true, userId: true, isLeader: true, teamKey: true, identityVerified: true, validFrom: true },
            },
          },
        }),
      ]);
      return { usuarios: users, areas };
    },
  },
  {
    name: "trimestres",
    title: "Trimestres",
    description: "Trimestres con fechas, objetivo, plan asociado y cuántos rocks y reuniones L10 tienen.",
    inputSchema: schema({}),
    handler: async () => {
      const qs = await prisma.quarter.findMany({
        orderBy: [{ year: "desc" }, { quarter: "desc" }],
        include: { plan: { select: { name: true } }, _count: { select: { rocks: true, l10Meetings: true } } },
      });
      return qs.map((q) => ({
        trimestre: qLabel(q),
        id: q.id,
        activo: q.isActive,
        inicio: q.startDate,
        fin: q.endDate,
        objetivo: q.objective,
        plan: q.plan?.name ?? null,
        rocks: q._count.rocks,
        reunionesL10: q._count.l10Meetings,
      }));
    },
  },
  {
    name: "rocks",
    title: "Rocks",
    description: "Rocks (prioridades trimestrales) con dueño, avance, estado, riesgo e issues ligados. Por defecto, trimestre activo.",
    inputSchema: schema({ trimestre: P.trimestre, persona: P.persona, estado: { type: "string", description: "on_track, off_track, riesgo, done, not_done" } }),
    handler: async (a) => {
      const [qid, owners] = await Promise.all([quarterId(a, true), personIds(a)]);
      const rocks = await prisma.rock.findMany({
        where: { quarterId: qid, ownerId: owners ? { in: owners } : undefined, status: str(a, "estado") },
        orderBy: [{ quarter: { year: "desc" } }, { quarter: { quarter: "desc" } }, { owner: { name: "asc" } }],
        include: {
          owner: userSel,
          quarter: { select: { year: true, quarter: true } },
          linkedIssues: { select: { id: true, title: true, idsStatus: true, meeting: { select: { date: true } } } },
        },
      });
      return rocks.map(({ quarter, ...r }) => ({ ...r, trimestre: qLabel(quarter) }));
    },
  },
  {
    name: "scorecard",
    title: "Scorecard",
    description:
      "Métricas del scorecard con dueño, meta y sus entradas por período (valor real, esperado, estado, notas). Por defecto, trimestre activo.",
    inputSchema: schema({
      trimestre: P.trimestre,
      persona: { ...P.persona, description: "Dueño de la métrica (nombre o email)." },
      metrica: { type: "string", description: "Nombre de la métrica (coincidencia parcial)." },
      categoria: { type: "string", description: "revenue_health, sales_health, customer_success, product_engineering, financial_health" },
      desde: { ...P.desde, description: "Filtra entradas por inicio de período." },
      hasta: { ...P.hasta, description: "Filtra entradas por inicio de período." },
      incluir_inactivas: { type: "boolean", description: "Incluye métricas desactivadas." },
    }),
    handler: async (a) => {
      const [qid, owners] = await Promise.all([quarterId(a, true), personIds(a)]);
      const metricName = str(a, "metrica");
      const metrics = await prisma.scorecardMetric.findMany({
        where: {
          isActive: bool(a, "incluir_inactivas") ? undefined : true,
          ownerId: owners ? { in: owners } : undefined,
          category: str(a, "categoria"),
          name: metricName ? { contains: metricName, mode: "insensitive" } : undefined,
        },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
        include: {
          owner: userSel,
          entries: {
            where: { quarterId: qid, periodStart: range(a) },
            orderBy: { periodStart: "asc" },
            include: { enteredBy: userSel, quarter: { select: { year: true, quarter: true } } },
          },
        },
      });
      return metrics.map((m) => ({
        ...m,
        entries: m.entries.map(({ quarter, ...e }) => ({ ...e, trimestre: qLabel(quarter) })),
      }));
    },
  },
  {
    name: "seleccion_metricas",
    title: "Métricas oficiales del trimestre",
    description: "Lista principal de métricas por área para un trimestre (con definición y estado de aprobación). Por defecto, trimestre activo.",
    inputSchema: schema({ trimestre: P.trimestre }),
    handler: async (a) => {
      const qid = await quarterId(a, true);
      return prisma.quarterMetricSelection.findMany({
        where: { quarterId: qid },
        orderBy: [{ area: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        include: {
          area: { select: { key: true, name: true } },
          plan: { select: { name: true } },
          quarter: { select: { year: true, quarter: true } },
          planKpi: { select: { name: true, slug: true, unit: true, target: true } },
          scorecardMetric: { select: { name: true, unit: true, targetNumeric: true, targetDirection: true } },
        },
      });
    },
  },
  {
    name: "wins_retos",
    title: "Wins y retos",
    description: "Wins y retos reportados por los líderes, con resultado, prioridad y siguiente acción.",
    inputSchema: schema({
      persona: P.persona,
      tipo: { type: "string", enum: ["win", "challenge"] },
      trimestre: P.trimestre,
      desde: P.desde,
      hasta: P.hasta,
      limite: P.limite,
    }),
    handler: async (a) => {
      const [qid, people] = await Promise.all([quarterId(a, false), personIds(a)]);
      return prisma.winChallenge.findMany({
        where: { quarterId: qid, userId: people ? { in: people } : undefined, entryType: str(a, "tipo"), reportDate: range(a) },
        orderBy: { reportDate: "desc" },
        take: limitOf(a),
        include: { user: userSel },
      });
    },
  },
  {
    name: "l10_reuniones",
    title: "Reuniones L10",
    description: "Lista de reuniones L10 (más recientes primero) con estado, fase y conteo de issues, compromisos y anotaciones.",
    inputSchema: schema({
      trimestre: P.trimestre,
      estado: { type: "string", description: "upcoming, in_progress, completed" },
      desde: P.desde,
      hasta: P.hasta,
      limite: P.limite,
    }),
    handler: async (a) => {
      const qid = await quarterId(a, false);
      const meetings = await prisma.l10Meeting.findMany({
        where: { quarterId: qid, status: str(a, "estado"), date: range(a) },
        orderBy: { date: "desc" },
        take: limitOf(a, 20),
        include: {
          quarter: { select: { year: true, quarter: true } },
          closedBy: userSel,
          _count: { select: { issues: true, commitments: true, annotations: true, preReadReads: true } },
        },
      });
      return meetings.map(({ quarter, ...m }) => ({ ...m, trimestre: qLabel(quarter) }));
    },
  },
  {
    name: "l10_reunion",
    title: "Detalle de una L10",
    description:
      "Todo lo de una reunión L10: issues con votos y resolución, compromisos, anotaciones del pre-read, coverage, lecturas, preparación de líderes y reportes publicados.",
    inputSchema: schema({
      id: { type: "string", description: "Id de la reunión (de l10_reuniones)." },
      fecha: { type: "string", description: "Alternativa al id: AAAA-MM-DD; toma la reunión de ese día." },
      incluir_reporte: { type: "boolean", description: "Incluye el contenido completo de los reportes publicados." },
    }),
    handler: async (a) => {
      let id = str(a, "id");
      const fecha = str(a, "fecha");
      if (!id && fecha) {
        const start = parseDate(fecha, "fecha");
        const m = await prisma.l10Meeting.findFirst({
          where: { date: { gte: start, lt: new Date(start.getTime() + 86_400_000) } },
          select: { id: true },
        });
        if (!m) throw new ToolInputError(`No hay reunión L10 el ${fecha}. Usá l10_reuniones para ver fechas.`);
        id = m.id;
      }
      if (!id) throw new ToolInputError("Pasá id o fecha.");
      const withReport = bool(a, "incluir_reporte");
      const meeting = await prisma.l10Meeting.findUnique({
        where: { id },
        include: {
          quarter: { select: { year: true, quarter: true } },
          closedBy: userSel,
          issues: {
            orderBy: { createdAt: "asc" },
            include: {
              raisedBy: userSel,
              owner: userSel,
              linkedRock: { select: { id: true, title: true } },
              linkedMetric: { select: { id: true, name: true } },
              votes: { select: { user: userSel } },
            },
          },
          commitments: { orderBy: { dueDate: "asc" }, include: { owner: userSel } },
          annotations: { orderBy: { createdAt: "asc" }, include: { author: userSel, resolvedBy: userSel } },
          coverages: { include: { createdBy: userSel, issue: { select: { id: true, title: true } } } },
          preReadReads: { select: { readAt: true, user: userSel } },
          leaderPreps: { include: { area: { select: { key: true, name: true } }, leader: userSel } },
          reports: {
            orderBy: { version: "asc" },
            select: {
              id: true,
              version: true,
              kind: true,
              status: true,
              closedAt: true,
              audience: true,
              channel: true,
              skipReason: true,
              content: withReport,
            },
          },
        },
      });
      if (!meeting) throw new ToolInputError(`No existe la reunión ${id}.`);
      const { quarter, issues, ...rest } = meeting;
      return {
        ...rest,
        trimestre: qLabel(quarter),
        issues: issues.map(({ votes, ...i }) => ({ ...i, votos: votes.length, votantes: votes.map((v) => v.user.name) })),
      };
    },
  },
  {
    name: "issues",
    title: "Issues (IDS)",
    description: "Issues de todas las L10, filtrables por persona (quien lo levantó o es dueño), estado y texto.",
    inputSchema: schema({
      persona: P.persona,
      estado: { type: "string", description: 'identify, discuss, solve, resolved o "abiertos" (todo menos resolved).' },
      texto: { type: "string", description: "Busca en título y descripción." },
      desde: { ...P.desde, description: "Fecha de creación inicial." },
      hasta: { ...P.hasta, description: "Fecha de creación final." },
      limite: P.limite,
    }),
    handler: async (a) => {
      const people = await personIds(a);
      const estado = str(a, "estado");
      const texto = str(a, "texto");
      return prisma.l10Issue.findMany({
        where: {
          AND: [
            people ? { OR: [{ raisedById: { in: people } }, { ownerId: { in: people } }] } : {},
            texto
              ? { OR: [{ title: { contains: texto, mode: "insensitive" } }, { description: { contains: texto, mode: "insensitive" } }] }
              : {},
          ],
          idsStatus: estado === "abiertos" ? { not: "resolved" } : estado,
          createdAt: range(a),
        },
        orderBy: { createdAt: "desc" },
        take: limitOf(a),
        include: {
          meeting: { select: { id: true, date: true } },
          raisedBy: userSel,
          owner: userSel,
          linkedRock: { select: { id: true, title: true } },
          linkedMetric: { select: { id: true, name: true } },
          _count: { select: { votes: true } },
        },
      });
    },
  },
  {
    name: "compromisos",
    title: "Compromisos de L10",
    description: "Compromisos (to-dos) de las L10 con dueño, fecha, estado, cambios de fecha y siguiente paso.",
    inputSchema: schema({
      persona: P.persona,
      estado: { type: "string", description: 'open, done, pending o "vencidos" (no hechos con fecha pasada).' },
      desde: { ...P.desde, description: "Fecha de vencimiento inicial." },
      hasta: { ...P.hasta, description: "Fecha de vencimiento final." },
      limite: P.limite,
    }),
    handler: async (a) => {
      const people = await personIds(a);
      const estado = str(a, "estado");
      const due = range(a) ?? {};
      const vencidos = estado === "vencidos";
      return prisma.l10Commitment.findMany({
        where: {
          ownerId: people ? { in: people } : undefined,
          status: vencidos ? { not: "done" } : estado,
          dueDate: vencidos ? { ...due, lt: due.lt && due.lt < new Date() ? due.lt : new Date() } : range(a),
        },
        orderBy: { dueDate: "asc" },
        take: limitOf(a),
        include: { owner: userSel, meeting: { select: { id: true, date: true } } },
      });
    },
  },
  {
    name: "checkins_equipo",
    title: "Check-ins del equipo",
    description:
      "Respuestas del check-in semanal del equipo (resultado, aprendizaje, bloqueo, compromiso y cumplimiento del anterior), más la energía agregada por semana.",
    inputSchema: schema({
      semana: { type: "string", description: "Cualquier fecha AAAA-MM-DD de la semana; toma su lunes." },
      desde: { ...P.desde, description: "Semana inicial (lunes) inclusiva." },
      hasta: { ...P.hasta, description: "Semana final inclusiva." },
      equipo: { type: "string", description: "ventas, soporte, revops, ingenieria, producto, onboarding, cs" },
      persona: { type: "string", description: "Nombre del autor (coincidencia parcial)." },
      incluir_ocultos: { type: "boolean", description: "Incluye respuestas ocultas del resumen." },
      limite: P.limite,
    }),
    handler: async (a) => {
      const semana = str(a, "semana");
      const period = semana ? { equals: crWeekStart(parseDate(semana, "semana")) } : range(a);
      const persona = str(a, "persona");
      const where = {
        periodStart: period,
        teamKey: str(a, "equipo"),
        authorName: persona ? { contains: persona, mode: "insensitive" as const } : undefined,
        hidden: bool(a, "incluir_ocultos") ? undefined : false,
      };
      const [rows, energy] = await Promise.all([
        prisma.teamCheckin.findMany({
          where,
          orderBy: [{ periodStart: "desc" }, { authorName: "asc" }],
          take: limitOf(a),
          // La energía individual no sale: solo el agregado de abajo.
          omit: { energy: true },
        }),
        prisma.teamCheckin.groupBy({
          by: ["periodStart"],
          where: { periodStart: period, teamKey: str(a, "equipo") },
          _avg: { energy: true },
          _count: { energy: true },
          orderBy: { periodStart: "desc" },
        }),
      ]);
      const low = await prisma.teamCheckin.groupBy({
        by: ["periodStart"],
        where: { periodStart: period, teamKey: str(a, "equipo"), energy: { lte: 2 } },
        _count: { _all: true },
      });
      const lowBy = new Map(low.map((l) => [l.periodStart.getTime(), l._count._all]));
      return {
        energiaPorSemana: energy.map((e) => ({
          semana: e.periodStart,
          promedio: e._avg.energy === null ? null : Math.round(e._avg.energy * 10) / 10,
          respuestas: e._count.energy,
          personasEn1o2: lowBy.get(e.periodStart.getTime()) ?? 0,
        })),
        respuestas: rows,
      };
    },
  },
  {
    name: "evidencia_checkins",
    title: "Evidencia de check-ins",
    description: "Texto original de cada respuesta de check-in en Slack, con win/reto extraídos, autor, área y permalink.",
    inputSchema: schema({
      semana: { type: "string", description: "Cualquier fecha AAAA-MM-DD de la semana; toma su lunes." },
      desde: P.desde,
      hasta: P.hasta,
      area: { type: "string", description: "ventas, growth, customer, producto, ingenieria" },
      persona: { type: "string", description: "Nombre del autor (coincidencia parcial)." },
      incluir_borrados: { type: "boolean" },
      limite: P.limite,
    }),
    handler: async (a) => {
      const semana = str(a, "semana");
      const persona = str(a, "persona");
      return prisma.checkinEvidence.findMany({
        where: {
          periodStart: semana ? { equals: crWeekStart(parseDate(semana, "semana")) } : range(a),
          areaKey: str(a, "area"),
          authorName: persona ? { contains: persona, mode: "insensitive" } : undefined,
          deletedAt: bool(a, "incluir_borrados") ? undefined : null,
        },
        orderBy: { reportedAt: "desc" },
        take: limitOf(a),
      });
    },
  },
  {
    name: "resumenes_semanales",
    title: "Resúmenes semanales",
    description: "Resúmenes semanales de empresa (#weekly-check-ins): texto, estado de envío, temas que se repiten y permalink.",
    inputSchema: schema({ desde: P.desde, hasta: P.hasta, limite: P.limite }),
    handler: async (a) =>
      prisma.weeklySummary.findMany({ where: { periodStart: range(a) }, orderBy: { periodStart: "desc" }, take: limitOf(a, 12) }),
  },
  {
    name: "plan",
    title: "Plan",
    description: "Plan anual/semestral: KPIs con entradas mensuales (proyectado vs real), acciones, riesgos y propuestas por área. Por defecto, el plan activo.",
    inputSchema: schema({ nombre: { type: "string", description: "Nombre del plan (coincidencia parcial). Sin esto, el plan ACTIVE." } }),
    handler: async (a) => {
      const nombre = str(a, "nombre");
      const plan = await prisma.plan.findFirst({
        where: nombre ? { name: { contains: nombre, mode: "insensitive" } } : { status: "ACTIVE" },
        orderBy: { startDate: "desc" },
        include: {
          quarters: { select: { year: true, quarter: true, isActive: true } },
          kpis: {
            orderBy: { displayOrder: "asc" },
            include: { owner: userSel, entries: { orderBy: { period: "asc" } }, scorecardMetric: { select: { id: true, name: true } } },
          },
          actions: { orderBy: [{ area: "asc" }, { displayOrder: "asc" }], include: { owner: userSel } },
          risks: { orderBy: [{ area: "asc" }, { displayOrder: "asc" }] },
          proposals: { include: { owner: userSel, milestones: { orderBy: { targetDate: "asc" } } } },
        },
      });
      if (!plan) {
        const all = await prisma.plan.findMany({ select: { name: true, status: true } });
        throw new ToolInputError(`No encontré el plan. Planes: ${all.map((p) => `${p.name} (${p.status})`).join(", ") || "ninguno"}.`);
      }
      return plan;
    },
  },
  {
    name: "reportes_reunion",
    title: "Reportes de reunión",
    description: "Snapshots publicados del resumen de cada L10 cerrada (contenido completo y estado de entrega a Slack/Notion).",
    inputSchema: schema({
      reunion_id: { type: "string", description: "Id de la reunión L10." },
      desde: { ...P.desde, description: "Fecha de cierre inicial." },
      hasta: { ...P.hasta, description: "Fecha de cierre final." },
      limite: P.limite,
    }),
    handler: async (a) =>
      prisma.meetingReport.findMany({
        where: { meetingId: str(a, "reunion_id"), closedAt: range(a) },
        orderBy: [{ closedAt: "desc" }, { version: "desc" }],
        take: limitOf(a, 10),
        include: { deliveries: { select: { destination: true, partIndex: true, status: true, sentAt: true, lastError: true } } },
      }),
  },
];
