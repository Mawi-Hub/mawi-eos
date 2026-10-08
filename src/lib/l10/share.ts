// Controles de "lo que sale de la sala". El L10 guarda el detalle en privado;
// la empresa solo ve lo que alguien marcó como compartible y escribió a mano.
// Nada de esto copia description/resolution: el resumen es siempre texto propio.

import { screenSensitive, type SensitiveCategory } from "@/lib/report/privacy";

export const SHARED_SUMMARY_MAX = 400;

const CATEGORY_LABEL: Record<SensitiveCategory, string> = {
  salud: "salud",
  compensacion: "compensación",
  evaluacion: "evaluación",
  personal: "personal",
  confidencial: "confidencial",
  journal: "confidencial",
};

export function describeCategories(categories: SensitiveCategory[]): string {
  return [...new Set(categories.map((c) => CATEGORY_LABEL[c]))].join(", ");
}

export type ShareResult =
  | { ok: true; shareable: boolean; sharedSummary: string | null }
  | { ok: false; error: string };

// Valida el par shareable/sharedSummary de un IDS. Si no es compartible, el
// resumen se descarta (null): no queda texto huérfano que pueda filtrarse luego.
export function validateIssueShare(input: { shareable?: unknown; sharedSummary?: unknown }): ShareResult {
  if (input.shareable !== undefined && typeof input.shareable !== "boolean") {
    return { ok: false, error: "shareable debe ser verdadero o falso" };
  }
  if (input.sharedSummary !== undefined && input.sharedSummary !== null && typeof input.sharedSummary !== "string") {
    return { ok: false, error: "El resumen compartido debe ser texto" };
  }
  const shareable = input.shareable === true;
  if (!shareable) return { ok: true, shareable: false, sharedSummary: null };

  const summary = typeof input.sharedSummary === "string" ? input.sharedSummary.trim() : "";
  if (summary.length < 1) {
    return { ok: false, error: "Para compartir un IDS escribí el resumen que verá la empresa (el detalle sigue privado)" };
  }
  if (summary.length > SHARED_SUMMARY_MAX) {
    return { ok: false, error: `El resumen compartido admite hasta ${SHARED_SUMMARY_MAX} caracteres` };
  }
  const screened = screenSensitive(summary);
  if (screened.sensitive) {
    return {
      ok: false,
      error: `El resumen parece tocar temas sensibles (${describeCategories(screened.categories)}). Reescribilo sin ese detalle o no lo compartas.`,
    };
  }
  return { ok: true, shareable: true, sharedSummary: summary };
}

// Un acuerdo compartible muestra su texto de acción a la empresa: debe pasar
// el mismo filtro. Si no es compartible no se revisa nada.
export function validateCommitmentShare(input: { shareable: boolean; action: string }): { ok: true } | { ok: false; error: string } {
  if (!input.shareable) return { ok: true };
  const screened = screenSensitive(input.action);
  if (screened.sensitive) {
    return {
      ok: false,
      error: `La acción de un acuerdo compartido no puede tocar temas sensibles (${describeCategories(screened.categories)}). Reescribila o desmarcá "compartir".`,
    };
  }
  return { ok: true };
}
