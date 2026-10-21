// Ajustes de la empresa que antes estaban fijos en el código.

export function maxRocksPerPerson(): number {
  const n = Number(process.env.ROCKS_PER_PERSON_MAX ?? "2");
  return Number.isInteger(n) && n > 0 ? n : 2;
}
