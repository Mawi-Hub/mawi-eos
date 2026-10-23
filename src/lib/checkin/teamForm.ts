// Formulario de Slack del check-in semanal: mensaje de invitación, modal y
// lectura de lo enviado. Lógica pura (sin red ni base de datos) para poder
// probarla tal cual.

import { neutralizeSlack, oneLine } from "@/lib/report/privacy";
import { crIsoDate } from "@/lib/time/costaRica";
import { BLOCKER_QUESTION, COMMITMENT_QUESTION, ENERGY_OPTIONS, ENERGY_QUESTION, ENERGY_REASON_QUESTION, PREVIOUS_STATUS_LABEL, type TeamConfig } from "./teams";

export const OPEN_ACTION_ID = "team_checkin_open";
export const MODAL_CALLBACK_ID = "team_checkin";

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_MAX = 1500;
const SHORT_MAX = 300;

export type SystemNumber = { label: string; valueText: string | null; targetText: string | null; periodLabel: string };

export type ExistingAnswers = {
  energy: number | null;
  result: string;
  learning: string;
  extra: string | null;
  blocker: string | null;
  commitment: string;
  previousCommitmentStatus: string | null;
  numbers: Array<{ key: string; value: number | null }>;
};

export type ModalInput = {
  team: TeamConfig;
  periodStart: Date;
  firstName: string;
  systemNumbers: SystemNumber[];
  previousCommitment: string | null;
  existing: ExistingAnswers | null;
  memberId: string;
};

export type Submission = {
  energy: number;
  // Solo viaja a Notion; EOS no lo guarda.
  energyReason: string | null;
  result: string;
  learning: string;
  extra: string | null;
  blocker: string | null;
  commitment: string;
  previousCommitmentStatus: "done" | "partial" | "not_done" | null;
  numbers: Array<{ key: string; label: string; value: number | null }>;
};

export type ModalMetadata = { p: string; m: string };

type PlainText = { type: "plain_text"; text: string; emoji?: boolean };
const plain = (text: string): PlainText => ({ type: "plain_text", text, emoji: true });
const mrkdwn = (text: string) => ({ type: "mrkdwn", text });

// "19 al 25 de octubre" (semana lunes→domingo en hora CR).
export function weekLabel(periodStart: Date): string {
  const start = new Date(periodStart.getTime() + 12 * 60 * 60 * 1000);
  const end = new Date(periodStart.getTime() + 6 * DAY_MS + 12 * 60 * 60 * 1000);
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString("es", { day: "numeric", ...(withMonth ? { month: "long" } : {}), timeZone: "America/Costa_Rica" });
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return sameMonth ? `${fmt(start, false)} al ${fmt(end, true)}` : `${fmt(start, true)} al ${fmt(end, true)}`;
}

function systemNumbersText(numbers: SystemNumber[]): string {
  if (numbers.length === 0) return "_Tu área todavía no tiene métricas seleccionadas para este trimestre._";
  return numbers
    .map((n) => {
      const value = n.valueText ? `*${neutralizeSlack(n.valueText)}*` : "_sin dato_";
      const target = n.targetText ? ` · meta ${neutralizeSlack(n.targetText)}` : "";
      return `• ${neutralizeSlack(n.label)}: ${value}${target} _(${neutralizeSlack(n.periodLabel)})_`;
    })
    .join("\n");
}

// Mensaje del DM: la invitación con el botón que abre el formulario.
export function inviteBlocks(input: {
  firstName: string;
  teamName: string;
  periodStart: Date;
  reminder: boolean;
  answered: boolean;
}): { text: string; blocks: unknown[] } {
  const value = JSON.stringify({ p: crIsoDate(input.periodStart) });
  const week = weekLabel(input.periodStart);
  const lead = input.answered
    ? `✅ *Recibimos tu check-in de la semana del ${week}.* Gracias, ${neutralizeSlack(input.firstName)}. Podés editarlo hasta que se publique el resumen.`
    : input.reminder
      ? `⏰ ${neutralizeSlack(input.firstName)}, todavía falta tu check-in de *${neutralizeSlack(input.teamName)}* (semana del ${week}). ` +
        `Respondé antes de las 13:00, cuando armamos el resumen de la empresa.`
      : `👋 ¡Hola ${neutralizeSlack(input.firstName)}! Es hora del check-in semanal de *${neutralizeSlack(input.teamName)}* (semana del ${week}).\n` +
        `Son 4 preguntas cortas sobre tu aporte a los Rocks y KPIs del área. Tus números de sistemas ya vienen cargados.`;
  return {
    text: input.answered ? "Check-in recibido" : "Check-in semanal",
    blocks: [
      { type: "section", text: mrkdwn(lead) },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: OPEN_ACTION_ID,
            text: plain(input.answered ? "Editar mi respuesta" : "Responder check-in"),
            ...(input.answered ? {} : { style: "primary" }),
            value,
          },
        ],
      },
    ],
  };
}

function textInput(blockId: string, label: string, opts: { optional?: boolean; multiline?: boolean; max?: number; initial?: string | null; placeholder?: string }) {
  return {
    type: "input",
    block_id: blockId,
    optional: !!opts.optional,
    label: plain(label.slice(0, 2000)),
    element: {
      type: "plain_text_input",
      action_id: "v",
      multiline: opts.multiline ?? true,
      max_length: opts.max ?? LONG_MAX,
      ...(opts.initial ? { initial_value: opts.initial.slice(0, opts.max ?? LONG_MAX) } : {}),
      ...(opts.placeholder ? { placeholder: plain(opts.placeholder) } : {}),
    },
  };
}

export function buildModal(input: ModalInput): Record<string, unknown> {
  const { team, existing } = input;
  const metadata: ModalMetadata = { p: crIsoDate(input.periodStart), m: input.memberId };
  const blocks: unknown[] = [
    {
      type: "section",
      text: mrkdwn(`*${neutralizeSlack(team.name)}* · semana del ${weekLabel(input.periodStart)}\nContá tu aporte con evidencia: qué cambió para el cliente o para el número, no la lista de tareas.`),
    },
    { type: "context", elements: [mrkdwn(`*Lo que dicen los sistemas*\n${systemNumbersText(input.systemNumbers)}`.slice(0, 1900))] },
    { type: "divider" },
  ];

  // Lo personal primero: cómo llega la persona a la semana.
  const energyOptions = ENERGY_OPTIONS.map((o) => ({ text: plain(o.label), value: String(o.value) }));
  const energyInitial = existing?.energy ? energyOptions.find((o) => o.value === String(existing.energy)) : undefined;
  blocks.push({
    type: "input",
    block_id: "energy",
    label: plain(ENERGY_QUESTION),
    hint: plain("Solo se comparte el promedio del equipo, nunca tu número."),
    element: { type: "radio_buttons", action_id: "v", options: energyOptions, ...(energyInitial ? { initial_option: energyInitial } : {}) },
  });
  blocks.push(
    textInput("energy_reason", ENERGY_REASON_QUESTION, {
      optional: true,
      max: 500,
      placeholder: "Va a la base de check-ins de Notion, no al resumen de la empresa.",
    }),
  );

  if (input.previousCommitment) {
    const initial = existing?.previousCommitmentStatus ?? null;
    const options = (["done", "partial", "not_done"] as const).map((v) => ({ text: plain(PREVIOUS_STATUS_LABEL[v]), value: v }));
    blocks.push({
      type: "input",
      block_id: "prev",
      label: plain("La semana pasada te comprometiste a:"),
      hint: plain(oneLine(input.previousCommitment, 280)),
      element: {
        type: "radio_buttons",
        action_id: "v",
        options,
        ...(initial && PREVIOUS_STATUS_LABEL[initial] ? { initial_option: options.find((o) => o.value === initial) } : {}),
      },
    });
  }

  blocks.push(textInput("result", team.result, { initial: existing?.result }));
  blocks.push(textInput("learning", team.learning, { initial: existing?.learning }));
  if (team.extra) blocks.push(textInput("extra", team.extra, { optional: true, initial: existing?.extra }));

  for (const field of team.numbers) {
    const prior = existing?.numbers.find((n) => n.key === field.key)?.value;
    blocks.push({
      type: "input",
      block_id: `num_${field.key}`,
      optional: true,
      label: plain(field.label),
      ...(field.hint ? { hint: plain(field.hint) } : {}),
      element: {
        type: "number_input",
        action_id: "v",
        is_decimal_allowed: !!field.decimal,
        min_value: "0",
        ...(prior !== undefined && prior !== null ? { initial_value: String(prior) } : {}),
      },
    });
  }

  blocks.push(textInput("blocker", BLOCKER_QUESTION, { optional: true, initial: existing?.blocker, placeholder: "Opcional. Ej.: necesito que Producto defina X antes del jueves." }));
  blocks.push(textInput("commitment", COMMITMENT_QUESTION, { multiline: false, max: SHORT_MAX, initial: existing?.commitment, placeholder: "Una línea, con algo que se pueda verificar el próximo jueves." }));

  return {
    type: "modal",
    callback_id: MODAL_CALLBACK_ID,
    private_metadata: JSON.stringify(metadata),
    title: plain("Check-in semanal"),
    submit: plain(existing ? "Guardar cambios" : "Enviar"),
    close: plain("Cancelar"),
    blocks,
  };
}

type StateValues = Record<string, Record<string, { value?: string | null; selected_option?: { value?: string } | null }>>;

function clean(value: string | null | undefined, max: number): string | null {
  const v = (value ?? "").replace(/\r/g, "").trim();
  return v ? v.slice(0, max) : null;
}

export function parseMetadata(raw: unknown): ModalMetadata | null {
  try {
    const parsed = JSON.parse(String(raw ?? "")) as Partial<ModalMetadata>;
    if (typeof parsed.p !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.p) || typeof parsed.m !== "string") return null;
    return { p: parsed.p, m: parsed.m };
  } catch {
    return null;
  }
}

// Lee el formulario enviado. Devuelve errores por bloque (Slack los muestra en
// el modal) o la respuesta lista para guardar.
export function parseSubmission(
  team: TeamConfig,
  values: StateValues,
  hasPrevious: boolean,
): { ok: true; submission: Submission } | { ok: false; errors: Record<string, string> } {
  const text = (block: string, max = LONG_MAX) => clean(values[block]?.v?.value, max);
  const errors: Record<string, string> = {};
  const result = text("result");
  const learning = text("learning");
  const commitment = text("commitment", SHORT_MAX);
  if (!result || result.length < 3) errors.result = "Contanos el resultado, aunque sea en una línea.";
  if (!learning || learning.length < 3) errors.learning = "Contanos qué aprendiste.";
  if (!commitment || commitment.length < 3) errors.commitment = "Dejá un compromiso para la próxima semana.";

  const energyRaw = Number(values.energy?.v?.selected_option?.value);
  const energy = Number.isInteger(energyRaw) && energyRaw >= 1 && energyRaw <= 5 ? energyRaw : null;
  if (energy === null) errors.energy = "Elegí tu energía del 1 al 5.";

  let previous: Submission["previousCommitmentStatus"] = null;
  if (hasPrevious) {
    const v = values.prev?.v?.selected_option?.value;
    if (v === "done" || v === "partial" || v === "not_done") previous = v;
    else errors.prev = "Marcá cómo terminó tu compromiso anterior.";
  }

  const numbers: Submission["numbers"] = [];
  for (const field of team.numbers) {
    const raw = values[`num_${field.key}`]?.v?.value;
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      numbers.push({ key: field.key, label: field.label, value: null });
      continue;
    }
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      errors[`num_${field.key}`] = "Tiene que ser un número igual o mayor que 0.";
      continue;
    }
    numbers.push({ key: field.key, label: field.label, value: field.decimal ? n : Math.round(n) });
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    submission: {
      energy: energy!,
      energyReason: text("energy_reason", 500),
      result: result!,
      learning: learning!,
      extra: team.extra ? text("extra") : null,
      blocker: text("blocker"),
      commitment: commitment!,
      previousCommitmentStatus: previous,
      numbers,
    },
  };
}

// Texto plano de la respuesta completa (CheckinEvidence.originalText y Notion).
export function submissionText(team: TeamConfig, s: Submission, previousCommitment: string | null): string {
  const lines = [`Resultado: ${s.result}`, `Aprendizaje: ${s.learning}`];
  if (s.extra) lines.push(`${team.extra}: ${s.extra}`);
  const nums = s.numbers.filter((n) => n.value !== null).map((n) => `${n.label}: ${n.value}`);
  if (nums.length) lines.push(`Números: ${nums.join(" · ")}`);
  if (s.blocker) lines.push(`Bloqueo: ${s.blocker}`);
  if (previousCommitment) lines.push(`Compromiso anterior (${PREVIOUS_STATUS_LABEL[s.previousCommitmentStatus ?? ""] ?? "sin marcar"}): ${previousCommitment}`);
  lines.push(`Compromiso: ${s.commitment}`);
  return lines.join("\n");
}

export function numbersText(numbers: Submission["numbers"]): string | null {
  const parts = numbers.filter((n) => n.value !== null).map((n) => `${n.label}: ${n.value}`);
  return parts.length ? parts.join(" · ") : null;
}
