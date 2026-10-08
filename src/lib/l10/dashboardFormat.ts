// Formato del tablero del CEO. Una tasa sin muestra (null/undefined/NaN) nunca
// se muestra como 0.0%: es "Sin muestra". Si hay n/N se muestra al lado.

export type RateDetail = { numerator: number; denominator: number } | null | undefined;

export function formatRate(value: number | null | undefined, detail?: RateDetail): { text: string; detail: string | null; hasSample: boolean } {
  const nOverN = detail && Number.isFinite(detail.numerator) && Number.isFinite(detail.denominator) ? `${detail.numerator}/${detail.denominator}` : null;
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { text: "Sin muestra", detail: nOverN, hasSample: false };
  }
  return { text: `${value.toFixed(1)}%`, detail: nOverN, hasSample: true };
}

// NDR del mes desde el desglose de MRR: (MRR inicial + expansión - contracción
// - churn) / MRR inicial. Los signos de contracción/churn varían por fuente, por
// eso se toma el valor absoluto. Sin MRR inicial no hay NDR.
export function computeNdr(
  prev: { mrr: number } | undefined,
  last: { mrrExpansion: number; mrrContraction: number; mrrChurn: number } | undefined,
): number | null {
  if (!prev || !last || !Number.isFinite(prev.mrr) || prev.mrr <= 0) return null;
  const end = prev.mrr + Math.abs(last.mrrExpansion) - Math.abs(last.mrrContraction) - Math.abs(last.mrrChurn);
  return (end / prev.mrr) * 100;
}
