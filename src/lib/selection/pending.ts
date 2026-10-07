// Qué le falta a una métrica seleccionada para poder medirse. Una fila
// "pendiente de configuración" no es un error: es una métrica propuesta que
// todavía no tiene todo lo necesario para mostrar un valor honesto.

import type { SelectionMetricView } from "./types";

export type MissingPiece = { key: "source" | "definition" | "target"; label: string; hint: string };

export function pendingMissing(view: Pick<SelectionMetricView, "metric" | "approvalStatus" | "definition">): MissingPiece[] {
  const missing: MissingPiece[] = [];
  if (!view.metric) {
    missing.push({
      key: "source",
      label: "Fuente de datos",
      hint: "La métrica aún no existe en EOS ni está conectada a una fuente (HubSpot, Help Scout, manual…).",
    });
  }
  if (view.approvalStatus !== "approved") {
    missing.push({
      key: "definition",
      label: "Definición aprobada",
      hint: "El líder y management deben confirmar la fórmula (qué cuenta y qué no), el responsable y el período.",
    });
  }
  if (view.definition?.targetConfirmed !== true) {
    missing.push({
      key: "target",
      label: "Meta confirmada",
      hint: "Sin una meta acordada no hay semáforo: la propuesta comercial es solo una referencia.",
    });
  }
  return missing;
}

export const PENDING_EXPLAINER =
  "«Pendiente de configuración» significa que la métrica ya está propuesta para el trimestre, pero todavía no está lista para medirse. " +
  "Le falta alguna de estas piezas: fuente de datos, definición aprobada o meta confirmada. " +
  "Mientras tanto no se muestra valor, ni un 0, ni semáforo, para no dar a entender un resultado que no existe.";
