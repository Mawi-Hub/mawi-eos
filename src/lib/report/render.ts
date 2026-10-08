// Mensajes de Slack del reporte de management. Funciones puras: reciben datos
// y devuelven texto, para poder previsualizarlos sin enviar nada.

import { DATA_STATE_LABEL } from "@/lib/metrics/dataState";
import { formatCrDateTime, formatCrShortDate } from "@/lib/time/costaRica";
import { neutralizeSlack } from "./privacy";
import type { AgreementItem, AreaBlock, BlockerItem, MeetingReportSnapshot, MetricLine, WinItem } from "./types";

// Tamaño práctico de un mensaje de Slack. Si el resumen lo supera se publica un
// mensaje principal y respuestas ordenadas en su mismo hilo.
export const SLACK_PART_LIMIT = 3500;

const ROCK_STATUS_TEXT = {
  en_camino: "en camino",
  en_riesgo: "en riesgo",
  completado: "completado",
  sin_estado: "sin estado",
} as const;

const SIGNAL_EMOJI = { on_track: "🟢", riesgo: "🟡", off_track: "🔴" } as const;

function metricLine(m: MetricLine): string {
  if (m.pendingConfig) {
    return `• ${neutralizeSlack(m.label)} · _pendiente de configuración (definición, fuente o meta sin aprobar)_`;
  }
  const meta = m.targetText ? `meta ${neutralizeSlack(m.targetText)}` : "meta pendiente";
  if (m.valueText === null) {
    const owner = m.ownerName ? ` Responsable: ${neutralizeSlack(m.ownerName)}.` : "";
    const last = m.lastValid ? ` Último valor válido: ${m.lastValid.valueText} de ${m.lastValid.periodLabel} (anterior; no define el estado actual).` : "";
    const lead =
      m.dataState === "stale"
        ? `la fuente no se actualiza al día. Falta validar ${m.periodLabel}.`
        : m.dataState === "no_sample"
          ? "sin muestra suficiente en el período."
          : m.dataState === "not_applicable"
            ? "no aplica este período."
            : m.dataState === "error"
              ? "error al obtener el dato."
              : `falta el dato de ${m.periodLabel}.`;
    return `• ${neutralizeSlack(m.label)}: ${lead}${owner}${last}`;
  }
  const signal = m.signal ? `${SIGNAL_EMOJI[m.signal]} ` : "";
  const nn = m.nOverN ? ` (${m.nOverN})` : "";
  const state = m.dataState === "value" ? "" : ` · ${DATA_STATE_LABEL[m.dataState].toLowerCase()}`;
  return `• ${signal}${neutralizeSlack(m.label)} · ${m.valueText}${nn} · ${meta} · ${m.periodLabel}${state}`;
}

function rockBlock(a: AreaBlock): string {
  const owner = a.leaderName ? ` · ${neutralizeSlack(a.leaderName)}` : "";
  const head = a.rock
    ? `*${neutralizeSlack(a.areaName)}*${owner} · ${a.rock.title} · ${ROCK_STATUS_TEXT[a.rock.status]}${a.rock.progress != null ? ` (${a.rock.progress}%)` : ""}`
    : `*${neutralizeSlack(a.areaName)}*${owner} · Rock principal por definir`;
  const lines = [head];
  if (a.prepStatus === "missing") {
    lines.push("   Avance: pendiente de preparación del líder.");
  } else {
    lines.push(
      `   Avance: ${a.advance ?? "sin novedades compartidas"}.${a.nextStep ? ` Próximo paso: ${a.nextStep}.` : ""}${a.prepStatus === "draft" ? " _(preparación sin confirmar)_" : ""}`,
    );
  }
  return lines.join("\n");
}

function winLine(w: WinItem): string {
  const who = w.contributors.length ? ` — ${w.contributors.map(neutralizeSlack).join(", ")}` : "";
  return `• ${w.text}${w.result ? ` (${w.result})` : ""}${who}${w.why ? `. Por qué importa: ${w.why}` : ""}`;
}

function blockerLine(b: BlockerItem): string {
  const parts = [b.text];
  if (b.helpFrom) parts.push(`puede ayudar: ${neutralizeSlack(b.helpFrom)}`);
  if (b.neededBy) parts.push(`fecha necesaria: ${b.neededBy}`);
  parts.push(b.resolved ? "decisión tomada" : "decisión pendiente");
  return `• ${parts.join(" · ")}`;
}

function agreementLine(a: AgreementItem): string {
  const status = !a.accepted ? "propuesto (aún no aceptado)" : a.status === "done" ? "cumplido" : a.status === "pending" ? "pendiente" : "abierto";
  const date = a.dueDate ?? "por acordar";
  const moved = a.originalDueDate ? ` (fecha original ${a.originalDueDate}${a.dateChangeReason ? `; motivo: ${neutralizeSlack(a.dateChangeReason)}` : ""})` : "";
  const next = a.nextStep ? ` · siguiente paso: ${a.nextStep}` : "";
  return `• ${a.action} · responsable ${neutralizeSlack(a.ownerName)} · fecha ${date}${moved} · estado ${status}${next}`;
}

function contributionsByArea(s: MeetingReportSnapshot): string[] {
  const groups = new Map<string, { name: string; lines: string[] }>();
  for (const c of s.contributions) {
    const key = c.areaKey ?? "_sin_area";
    const name = c.areaName ?? "Área por confirmar";
    if (!groups.has(key)) groups.set(key, { name, lines: [] });
    groups.get(key)!.lines.push(`• ${c.name}: ${c.text}${c.late ? " _(llegó después del corte)_" : ""}`);
  }
  // Orden estable: el de las áreas del snapshot, luego las sin área.
  const order = s.areas.map((a) => a.areaKey);
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([, g]) => `*Contribuciones del equipo · ${g.name}*\n${g.lines.join("\n")}`);
}

// Parte un bloque largo por líneas para respetar el límite.
function splitBlock(block: string, limit: number): string[] {
  if (block.length <= limit) return [block];
  const out: string[] = [];
  let current = "";
  for (const line of block.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit && current) {
      out.push(current);
      current = line.length > limit ? line.slice(0, limit - 1) + "…" : line;
    } else {
      current = line.length > limit ? line.slice(0, limit - 1) + "…" : next;
    }
  }
  if (current) out.push(current);
  return out;
}

export function packParts(blocks: string[], limit = SLACK_PART_LIMIT): string[] {
  const parts: string[] = [];
  let current = "";
  for (const raw of blocks) {
    for (const block of splitBlock(raw, limit)) {
      const next = current ? `${current}\n\n${block}` : block;
      if (next.length > limit && current) {
        parts.push(current);
        current = block;
      } else {
        current = next;
      }
    }
  }
  if (current) parts.push(current);
  return parts;
}

// Resumen para toda la empresa. parts[0] es el mensaje principal; el resto son
// respuestas en su hilo. Todos los bloques están presentes: sin novedades se
// dice "Sin novedades", y lo que falta se marca como pendiente.
export function renderMeetingSummary(s: MeetingReportSnapshot): { parts: string[] } {
  const date = formatCrShortDate(new Date(s.meetingDate));
  const cut = formatCrDateTime(new Date(s.period.cutAt));

  const header = [
    `*Mawi · Management del ${date}*${s.update ? ` — ✏️ *Actualización*` : ""}`,
    s.update ? `_Corrige la versión ${s.update.ofVersion}${s.update.reason ? `: ${neutralizeSlack(s.update.reason)}` : ""}. Lo publicado antes se conserva._` : null,
    `Objetivo del trimestre (${s.quarterLabel}): ${s.objective ?? "_por definir_"}`,
    `_Información al ${cut} · Reunión cerrada por ${neutralizeSlack(s.closedByName)}_`,
  ]
    .filter(Boolean)
    .join("\n");

  const rocks = `*Rocks y avances*\n${s.areas.length ? s.areas.map(rockBlock).join("\n") : "Sin áreas configuradas."}`;

  let scorecardBody: string;
  if (s.selectionStatus === "legacy_no_selection") {
    scorecardBody = "Este trimestre no tiene una selección de métricas registrada (legado). No se muestra una lista reconstruida.";
  } else {
    const perArea = s.areas
      .filter((a) => a.metrics.length > 0)
      .map((a) => `_${neutralizeSlack(a.areaName)}_\n${a.metrics.map(metricLine).join("\n")}`);
    scorecardBody = perArea.length ? perArea.join("\n") : "Sin métricas seleccionadas para este trimestre.";
  }
  const company = s.companyMetrics.length ? `\n_Resultados de empresa_\n${s.companyMetrics.map(metricLine).join("\n")}` : "";
  const scorecard = `*Scorecard del trimestre*\n${scorecardBody}${company}`;

  const winsBody = s.wins.length ? s.wins.map(winLine).join("\n") : "Sin wins destacados esta semana.";
  const contribNote = s.contributions.length
    ? `\n_Las contribuciones del equipo, agrupadas por área, están en este hilo ↓_`
    : "\n_No hay contribuciones del equipo aprobadas para compartir._";
  const wins = `*Wins y contribuciones*\n${winsBody}${contribNote}`;

  const blockers = `*Bloqueos y decisiones*\n${s.blockers.length ? s.blockers.map(blockerLine).join("\n") : "Sin bloqueos compartibles esta semana."}`;

  const agreements = `*Acuerdos*\n${s.agreements.length ? s.agreements.map(agreementLine).join("\n") : "Sin acuerdos compartibles esta semana."}`;

  const footer = `Detalle y fuentes: ${s.detailUrl ?? "_enlace por configurar_"}${s.notionUrl ? ` · Notion: ${s.notionUrl}` : ""}`;

  const mainBlocks = [header, rocks, scorecard, wins, blockers, agreements, footer];
  const replyBlocks = contributionsByArea(s);

  const parts = packParts(mainBlocks);
  // Las contribuciones siempre van en el hilo, nunca en el mensaje principal.
  parts.push(...packParts(replyBlocks));
  return { parts };
}

// ---------------------------------------------------------------------------
// Check-in del equipo (jueves). No cambia el punto de entrada actual: es el
// texto de la pregunta única, con el Rock vigente por área en un solo mensaje.
// ---------------------------------------------------------------------------

export function renderTeamCheckinPrompt(input: { rocks: Array<{ areaName: string; rockTitle: string | null }>; planUrl?: string | null }): string {
  const list = input.rocks.length
    ? input.rocks.map((r) => `• ${neutralizeSlack(r.areaName)}: ${r.rockTitle ? neutralizeSlack(r.rockTitle) : "por definir"}`).join("\n")
    : input.planUrl
      ? `Mirá los Rocks del trimestre en el Plan H2: ${input.planUrl}`
      : "_Rocks por definir_";
  return [
    "Equipo, compartamos los wins y challenges de esta semana.",
    "",
    `Rocks vigentes por área:\n${list}`,
    "",
    "¿Qué avance o resultado concreto lograste y cómo ayuda a ese Rock? ¿Qué se trabó y qué ayuda necesitás? Si podés, agregá un ejemplo o enlace. Si fue trabajo operativo importante fuera del Rock, contalo igual e indicá por qué aportó.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Preparación de líderes (jueves por la noche): cinco bloques precargados.
// ---------------------------------------------------------------------------

export type LeaderPrepPromptInput = {
  leaderName: string;
  meetingDate: Date;
  rock: { title: string; status: string } | null;
  metrics: Array<{ label: string; valueText: string | null; targetText: string | null; periodLabel: string; source: string }>;
  teamResponses: number;
  teamExpected: number | null;
  previousAgreements: Array<{ action: string; dueDate: string; ownerName: string }>;
  url: string | null;
};

export function renderLeaderPrepPrompt(i: LeaderPrepPromptInput): string {
  const rock = i.rock ? `${neutralizeSlack(i.rock.title)} (${i.rock.status})` : "_sin Rock principal definido_";
  const metrics = i.metrics.length
    ? i.metrics
        .map((m) => `• ${neutralizeSlack(m.label)}: ${m.valueText ?? "pendiente"} · meta ${m.targetText ?? "por confirmar"} · ${m.periodLabel} · ${m.source}`)
        .join("\n")
    : "_Sin métricas seleccionadas para tu área este trimestre._";
  const agreements = i.previousAgreements.length
    ? i.previousAgreements.map((a) => `• ${neutralizeSlack(a.action)} — ${neutralizeSlack(a.ownerName)}, vence ${a.dueDate}`).join("\n")
    : "_No hay acuerdos anteriores abiertos._";
  const team = i.teamExpected != null ? `${i.teamResponses}/${i.teamExpected}` : `${i.teamResponses}`;

  return [
    `${neutralizeSlack(i.leaderName)}, preparemos management de ${formatCrShortDate(i.meetingDate)}. Esto está precargado con EOS y los reportes de tu equipo; confirmá o corregí lo que haga falta.`,
    "",
    `*1. Rock principal:* ${rock}. ¿Va en camino, está en riesgo o está completado? ¿Qué hito o avance real hubo? Si se desvió, ¿qué cambió y cuál es el siguiente paso?`,
    "",
    `*2. Scorecard del trimestre:*\n${metrics}\nConfirmá los datos o completá los pendientes. Para métricas mensuales usá mes a la fecha o último mes cerrado; no inventés un resultado semanal.`,
    "",
    `*3. Wins del área:* elegí uno o dos resultados que valga la pena destacar, quiénes contribuyeron y por qué importan. Ya tenés las respuestas del equipo (${team}).`,
    "",
    `*4. Acuerdos anteriores de management:*\n${agreements}\nMarcá cumplido o pendiente. Si sigue pendiente, indicá la razón y el siguiente paso; una nueva fecha conserva la fecha original y su motivo.`,
    "",
    `*5. IDS y bloqueos:* ¿qué problema necesita discusión o ayuda de otra área? Indicá impacto, decisión que necesitás y fecha real si existe. Podés proponer una solución, pero no es obligatorio tenerla antes de pedir ayuda.`,
    "",
    `Acciones: *Guardar borrador* / *Confirmar preparación*. Confirmar registra los datos y su procedencia; no publica el contenido privado ni asigna tareas a otra área por sí solo.${i.url ? ` Registro de la reunión: ${i.url}` : ""}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Faltantes y errores
// ---------------------------------------------------------------------------

export const messages = {
  metricPending: (kpi: string, period: string, owner: string, lastValue?: { value: string; date: string }) =>
    `${neutralizeSlack(kpi)}: falta el dato de ${period}. Responsable: ${neutralizeSlack(owner)}.` +
    (lastValue ? ` Último valor válido: ${lastValue.value} de ${lastValue.date}, anterior; no define el semáforo actual.` : ""),
  metricStale: (kpi: string, since: string) => `${neutralizeSlack(kpi)}: la fuente no se actualiza desde ${since}. Falta validar el período actual.`,
  leaderReminder: (block: string, date: string, link: string) => `Falta confirmar ${block} para management de ${date}. Lo demás ya quedó guardado: ${link}`,
  captureFailed: "No pude guardar toda tu respuesta. Tu mensaje original sigue disponible; te confirmaremos cuando se recupere.",
  publishFailed: (destination: string, link: string) => `La reunión y el reporte están guardados, pero falló el envío a ${destination}. Estado y reintento: ${link}`,
  publishUncertain: (link: string) => `No pudimos confirmar si se publicó. Pausamos el reenvío hasta verificarlo: ${link}`,
};
