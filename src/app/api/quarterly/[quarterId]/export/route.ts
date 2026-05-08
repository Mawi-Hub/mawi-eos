import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CATEGORIES, STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/utils";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map((f) => escapeCsv(f == null ? "" : String(f))).join(",");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ quarterId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quarterId } = await params;

  const quarter = await prisma.quarter.findUnique({
    where: { id: quarterId },
  });

  if (!quarter) {
    return NextResponse.json({ error: "Quarter not found" }, { status: 404 });
  }

  const label = `Q${quarter.quarter} ${quarter.year}`;

  const [rocks, scorecardEntries, winsAndChallenges, meetings] =
    await Promise.all([
      prisma.rock.findMany({
        where: { quarterId },
        include: { owner: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.scorecardEntry.findMany({
        where: { quarterId },
        include: { metric: { include: { owner: true } } },
        orderBy: [{ metric: { sortOrder: "asc" } }, { periodStart: "asc" }],
      }),
      prisma.winChallenge.findMany({
        where: { quarterId },
        include: { user: true },
        orderBy: { reportDate: "asc" },
      }),
      prisma.l10Meeting.findMany({
        where: { quarterId },
        include: {
          issues: { include: { raisedBy: true, owner: true } },
          commitments: { include: { owner: true } },
        },
        orderBy: { date: "asc" },
      }),
    ]);

  const lines: string[] = [];

  // ── Header ──
  lines.push(csvRow([`Reporte Trimestral — ${label}`]));
  lines.push(
    csvRow([
      `Período: ${new Date(quarter.startDate).toLocaleDateString("es")} — ${new Date(quarter.endDate).toLocaleDateString("es")}`,
    ]),
  );
  lines.push("");

  // ── Rocks ──
  lines.push(csvRow(["=== ROCKS ==="]));
  lines.push(
    csvRow([
      "Título",
      "Owner",
      "Descripción",
      "Entregable",
      "Criterio Done",
      "Progreso %",
      "Estado",
      "Estado Final",
      "Riesgo",
    ]),
  );
  for (const r of rocks) {
    const status = r.finalStatus || r.status;
    lines.push(
      csvRow([
        r.title,
        r.owner.name,
        r.description,
        r.deliverable,
        r.doneCriteria,
        r.progress,
        STATUS_CONFIG[status]?.label ?? status,
        r.finalStatus ? (STATUS_CONFIG[r.finalStatus]?.label ?? r.finalStatus) : "",
        r.risk,
      ]),
    );
  }
  lines.push("");

  // ── Scorecard ──
  lines.push(csvRow(["=== SCORECARD ==="]));
  lines.push(
    csvRow([
      "Métrica",
      "Categoría",
      "Owner",
      "Período",
      "Valor",
      "Valor Display",
      "Target",
      "Estado",
      "Notas",
      "Frecuencia",
    ]),
  );
  for (const e of scorecardEntries) {
    const cat = CATEGORIES[e.metric.category]?.label ?? e.metric.category;
    lines.push(
      csvRow([
        e.metric.name,
        cat,
        e.metric.owner.name,
        new Date(e.periodStart).toLocaleDateString("es"),
        e.actualValue,
        e.actualDisplay,
        e.metric.targetValue,
        STATUS_CONFIG[e.status]?.label ?? e.status,
        e.notes,
        e.metric.frequency,
      ]),
    );
  }
  lines.push("");

  // ── Wins ──
  const wins = winsAndChallenges.filter((w) => w.entryType === "win");
  lines.push(csvRow(["=== WINS ==="]));
  lines.push(csvRow(["Fecha", "Persona", "Logro", "Resultado"]));
  for (const w of wins) {
    lines.push(
      csvRow([
        new Date(w.reportDate).toLocaleDateString("es"),
        w.user.name,
        w.wins,
        w.result,
      ]),
    );
  }
  lines.push("");

  // ── Challenges ──
  const challenges = winsAndChallenges.filter((w) => w.entryType === "challenge");
  lines.push(csvRow(["=== CHALLENGES ==="]));
  lines.push(
    csvRow(["Fecha", "Persona", "Challenge", "Prioridad", "Acción de seguimiento"]),
  );
  for (const c of challenges) {
    lines.push(
      csvRow([
        new Date(c.reportDate).toLocaleDateString("es"),
        c.user.name,
        c.keyChallenge,
        PRIORITY_CONFIG[c.priority]?.label ?? c.priority,
        c.followUpAction,
      ]),
    );
  }
  lines.push("");

  // ── L10 Meetings ──
  lines.push(csvRow(["=== L10 MEETINGS ==="]));
  for (const m of meetings) {
    lines.push(
      csvRow([
        `Reunión: ${new Date(m.date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
        `Estado: ${m.status}`,
      ]),
    );

    if (m.notes) {
      lines.push(csvRow(["Notas", m.notes]));
    }

    // Issues
    if (m.issues.length > 0) {
      lines.push(
        csvRow([
          "Issue",
          "Levantado por",
          "Prioridad",
          "Estado IDS",
          "Owner",
          "Resolución",
          "Due Date",
        ]),
      );
      for (const i of m.issues) {
        lines.push(
          csvRow([
            i.title,
            i.raisedBy.name,
            PRIORITY_CONFIG[i.priority]?.label ?? i.priority,
            i.idsStatus,
            i.owner?.name,
            i.resolution,
            i.dueDate ? new Date(i.dueDate).toLocaleDateString("es") : "",
          ]),
        );
      }
    }

    // Commitments
    if (m.commitments.length > 0) {
      lines.push(csvRow(["Compromiso", "Owner", "Due Date", "Completado"]));
      for (const c of m.commitments) {
        lines.push(
          csvRow([
            c.action,
            c.owner.name,
            new Date(c.dueDate).toLocaleDateString("es"),
            c.done ? "Sí" : "No",
          ]),
        );
      }
    }
    lines.push("");
  }

  const csv = "\uFEFF" + lines.join("\n");
  const filename = `mawi-${label.replace(" ", "-")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
