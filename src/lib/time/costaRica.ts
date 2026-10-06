// Costa Rica no tiene horario de verano: UTC-6 todo el año. Las fechas de
// negocio (semana, mes, corte) se calculan en hora local y se guardan como
// instantes UTC.

export const REPORT_TIME_ZONE = "America/Costa_Rica";
const CR_OFFSET_HOURS = 6; // 00:00 CR = 06:00 UTC
const DAY_MS = 24 * 60 * 60 * 1000;

export type CrParts = { year: number; month: number; day: number; weekday: number };

// weekday: 0 = lunes … 6 = domingo (semana de negocio lunes→domingo).
export function crParts(date: Date): CrParts {
  const local = new Date(date.getTime() - CR_OFFSET_HOURS * 60 * 60 * 1000);
  const jsDay = local.getUTCDay(); // 0 = domingo
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: (jsDay + 6) % 7,
  };
}

// Instante UTC de las 00:00 locales de un día calendario CR. Acepta días fuera
// de rango (p. ej. day = 0 o 32): Date.UTC normaliza el mes y el año.
export function crMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, CR_OFFSET_HOURS, 0, 0, 0));
}

export function crStartOfDay(date: Date): Date {
  const p = crParts(date);
  return crMidnight(p.year, p.month, p.day);
}

// Lunes 00:00 CR de la semana que contiene `date`.
export function crWeekStart(date: Date): Date {
  const p = crParts(date);
  return crMidnight(p.year, p.month, p.day - p.weekday);
}

// Fin de la semana de negocio: el instante anterior al lunes siguiente 00:00 CR.
export function crWeekEnd(date: Date): Date {
  return new Date(crWeekStart(date).getTime() + 7 * DAY_MS - 1);
}

export function crMonthStart(date: Date): Date {
  const p = crParts(date);
  return crMidnight(p.year, p.month, 1);
}

export function crMonthEnd(date: Date): Date {
  const p = crParts(date);
  return new Date(crMidnight(p.year, p.month + 1, 1).getTime() - 1);
}

// Período de reporte de una reunión: la semana lunes→domingo en la que cae.
export type ReportPeriod = { start: Date; end: Date };

export function reportPeriodFor(meetingDate: Date): ReportPeriod {
  return { start: crWeekStart(meetingDate), end: crWeekEnd(meetingDate) };
}

// El check-in se pide el jueves. Una respuesta pertenece a la semana del
// jueves más reciente que ya pasó; las tardías (sábado, lunes) siguen
// vinculadas a su período original y no se cuentan en la semana siguiente.
export function checkinPeriodStart(messageAt: Date): Date {
  const p = crParts(messageAt);
  const THURSDAY = 3;
  const daysSinceThursday = (p.weekday - THURSDAY + 7) % 7;
  const thursday = crMidnight(p.year, p.month, p.day - daysSinceThursday);
  return crWeekStart(thursday);
}

export function formatCrDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-CR", {
    timeZone: REPORT_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatCrDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CR", {
    timeZone: REPORT_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatCrShortDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CR", {
    timeZone: REPORT_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(date);
}

// YYYY-MM-DD en hora CR.
export function crIsoDate(date: Date): string {
  const p = crParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
