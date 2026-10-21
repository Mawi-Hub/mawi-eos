// Ayudas puras del check-in por canal (fecha local y validación de energía).
export const CHECKIN_TIME_ZONE = "America/Costa_Rica";

export function checkinDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHECKIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isEnergy(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5;
}
