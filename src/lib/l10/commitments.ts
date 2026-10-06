// Lógica pura de los acuerdos (compromisos) del L10: estado, sincronía con el
// booleano legado `done` e historial de cambios de fecha. Cerrar una reunión
// NUNCA completa acuerdos: el estado solo cambia por una acción explícita.

export const COMMITMENT_STATUSES = ["open", "done", "pending"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const NEXT_STEP_MAX = 300;
export const DATE_REASON_MAX = 300;

export function isCommitmentStatus(value: unknown): value is CommitmentStatus {
  return typeof value === "string" && (COMMITMENT_STATUSES as readonly string[]).includes(value);
}

export function statusToDone(status: CommitmentStatus): boolean {
  return status === "done";
}

// Resuelve el par (status, done) a partir de lo que llegó. `status` manda; si
// solo llega `done` (botón de marcar) se traduce: true → done, false → open
// (o se conserva "pending" si ya lo estaba y se desmarca).
export type StatusResolution =
  | { ok: true; changed: false }
  | { ok: true; changed: true; status: CommitmentStatus; done: boolean }
  | { ok: false; error: string };

export function resolveStatus(input: { status?: unknown; done?: unknown }, previous?: CommitmentStatus): StatusResolution {
  if (input.status !== undefined) {
    if (!isCommitmentStatus(input.status)) return { ok: false, error: "status debe ser open, done o pending" };
    return { ok: true, changed: true, status: input.status, done: statusToDone(input.status) };
  }
  if (input.done !== undefined) {
    if (typeof input.done !== "boolean") return { ok: false, error: "done debe ser verdadero o falso" };
    const status: CommitmentStatus = input.done ? "done" : previous === "pending" ? "pending" : "open";
    return { ok: true, changed: true, status, done: input.done };
  }
  return { ok: true, changed: false };
}

export type DateChange = { from: string; to: string; reason: string; byId: string; at: string };

// Fecha de calendario (YYYY-MM-DD) de un instante guardado en UTC medianoche.
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function readDateChanges(value: unknown): DateChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is DateChange =>
      !!c && typeof c === "object" && typeof (c as DateChange).from === "string" && typeof (c as DateChange).to === "string",
  );
}

// Agrega un cambio al historial sin tocar los anteriores. Devuelve null si la
// fecha no cambió (mismo día) para que quien llama no registre ruido.
export function appendDateChange(
  history: unknown,
  change: { from: Date; to: Date; reason: string; byId: string; at?: Date },
): DateChange[] | null {
  const from = dayKey(change.from);
  const to = dayKey(change.to);
  if (from === to) return null;
  return [
    ...readDateChanges(history),
    { from, to, reason: change.reason.trim(), byId: change.byId, at: (change.at ?? new Date()).toISOString() },
  ];
}

export function validateDateChangeReason(reason: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text) return { ok: false, error: "Al mover la fecha tenés que escribir el motivo del cambio" };
  if (text.length > DATE_REASON_MAX) return { ok: false, error: `El motivo admite hasta ${DATE_REASON_MAX} caracteres` };
  return { ok: true, reason: text };
}

export function validateNextStep(value: unknown): { ok: true; nextStep: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, nextStep: null };
  if (typeof value !== "string") return { ok: false, error: "nextStep debe ser texto" };
  const text = value.trim();
  if (text.length > NEXT_STEP_MAX) return { ok: false, error: `El próximo paso admite hasta ${NEXT_STEP_MAX} caracteres` };
  return { ok: true, nextStep: text || null };
}

export function optionalBoolean(value: unknown, name: string): { ok: true; value: boolean | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "boolean") return { ok: false, error: `${name} debe ser verdadero o falso` };
  return { ok: true, value };
}

// Fecha original a mostrar: la guardada, o (acuerdos viejos) la actual.
export function originalDueOf(c: { originalDueDate: Date | null; dueDate: Date }): Date {
  return c.originalDueDate ?? c.dueDate;
}

export function lastDateChange(history: unknown): DateChange | null {
  const list = readDateChanges(history);
  return list.length ? list[list.length - 1] : null;
}
