// Pure helpers shared by the weekly digest and its offline tests.
export const CHECKIN_TIME_ZONE = "America/Costa_Rica";

export type CheckinRow = {
  persona: string;
  tipo: string;
  fecha: string;
  createdAt?: string;
  energia: number | null;
  porQue: string | null;
  win: string | null;
  reto: string | null;
};

export function checkinDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHECKIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

// Seven complete local days. The Monday cron includes Monday–Sunday of the
// previous week, including late replies. Adjacent weekly runs don't overlap.
export function digestPeriod(now = new Date()) {
  const before = checkinDate(now);
  const from = shiftDate(before, -7);
  const through = shiftDate(before, -1);
  return { from, before, through, previousFrom: shiftDate(from, -7) };
}

export type DigestPeriod = ReturnType<typeof digestPeriod>;

export function isEnergy(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5;
}

type PersonCheckin = {
  persona: string;
  energia: number | null;
  porQue: string | null;
  wins: string[];
  retos: string[];
};

const personKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

function addUnique(items: string[], value: string | null) {
  const text = value?.trim();
  if (text && !items.some((item) => personKey(item) === personKey(text))) items.push(text);
}

// One energy reading per person: their most recent valid response. Preserve
// distinct wins/requests from follow-up messages without weighting them twice.
export function groupCheckins(rows: CheckinRow[]): PersonCheckin[] {
  const people = new Map<string, PersonCheckin>();
  const ordered = [...rows].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  for (const row of ordered) {
    const key = personKey(row.persona);
    const person = people.get(key) ?? {
      persona: row.persona.trim(), energia: null, porQue: null, wins: [], retos: [],
    };
    if (isEnergy(row.energia)) {
      person.energia = row.energia;
      person.porQue = row.porQue;
    }
    addUnique(person.wins, row.win);
    addUnique(person.retos, row.reto);
    people.set(key, person);
  }
  return [...people.values()];
}

export function digestStats(rows: CheckinRow[], previousRows: CheckinRow[]) {
  const people = groupCheckins(rows);
  const energies = people.map((p) => p.energia).filter(isEnergy);
  const previous = new Map(groupCheckins(previousRows).map((p) => [personKey(p.persona), p.energia]));
  const changes = people.flatMap((p) => {
    const prior = previous.get(personKey(p.persona));
    return isEnergy(p.energia) && isEnergy(prior) ? [p.energia - prior] : [];
  });
  return {
    people,
    participants: people.length,
    energyCount: energies.length,
    average: energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : null,
    lowEnergyCount: energies.filter((e) => e <= 2).length,
    comparisonCount: changes.length,
    // Avoid implying a team trend from one person's change.
    change: changes.length >= 2 ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
  };
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CR", {
    timeZone: CHECKIN_TIME_ZONE, day: "numeric", month: "short", year: "numeric",
  });
}

export function digestHeader(rows: CheckinRow[], previousRows: CheckinRow[], period: DigestPeriod): string {
  const stats = digestStats(rows, previousRows);
  const lines = [
    `🗓️ *Pulso semanal del equipo — ${shortDate(period.from)} al ${shortDate(period.through)}*`,
    `👥 *Participación:* ${stats.participants} persona${stats.participants === 1 ? " compartió" : "s compartieron"} check-in.`,
    stats.average === null
      ? "⚡ *Energía:* sin valores reportados."
      : `⚡ *Energía:* ${stats.average.toFixed(1)}/5 · ${stats.energyCount} persona${stats.energyCount === 1 ? "" : "s"} con dato (último valor por persona).`,
  ];
  if (stats.change !== null) {
    const change = Math.round(stats.change * 10) / 10;
    lines.push(`↔️ *Cambio frente al período anterior:* ${change > 0 ? "+" : ""}${change.toFixed(1)} puntos entre las mismas ${stats.comparisonCount} personas.`);
  }
  if (stats.lowEnergyCount > 0) {
    lines.push(`🤝 ${stats.lowEnergyCount} persona${stats.lowEnergyCount === 1 ? " reportó" : "s reportaron"} energía de 1–2/5; puede servir preguntar qué apoyo necesitan.`);
  }
  if (stats.energyCount > 0) lines.push("_El pulso refleja a quienes respondieron, no necesariamente a todo el equipo._");
  return lines.join("\n");
}

// Keep user-authored text from generating Slack mentions in the fallback.
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fallbackDigestBody(rows: CheckinRow[]): string {
  const people = groupCheckins(rows);
  const withChallenges = people.filter((p) => p.retos.length);
  const withWins = people.filter((p) => p.wins.length);
  // Historical fields can mix work challenges with health/family details.
  // Without a reliable synthesis, don't quote them into the public digest.
  // Keep every contributor visible so their requests can still be found.
  return [
    "🧱 *Retos compartidos para revisar*",
    withChallenges.length
      ? "Hay retos en los check-ins de:\n" + withChallenges.map((p) => `• *${escapeSlackText(p.persona)}*`).join("\n") +
        "\nLa síntesis de los detalles no está disponible. Revisemos esas respuestas en este canal para identificar dónde podemos ayudar."
      : "No se reportaron retos en este período.",
    "🏆 *Avances del equipo*",
    withWins.length
      ? `${withWins.length} persona${withWins.length === 1 ? " compartió logros" : "s compartieron logros"}; podés leerlos en sus check-ins originales.`
      : "No se reportaron logros en este período.",
    "🤝 Si podés ayudar, respondé en el hilo del check-in original.",
  ].join("\n\n");
}
