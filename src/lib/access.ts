// Quién ve qué. Dos niveles:
//   - Managers (roles ceo, sales, cs, product, engineering): operan EOS.
//   - Equipo (rol "team", entra con Google @mawi.io): ve cómo va la empresa
//     en lectura, sin IDS, respuestas individuales del check-in ni finanzas
//     detalladas.
// Este módulo no importa Prisma: lo usa también el middleware.

export const LEADER_ROLES = ["ceo", "sales", "cs", "product", "engineering"] as const;
export const TEAM_ROLE = "team";

export function isLeaderRole(role: string | null | undefined): boolean {
  return !!role && (LEADER_ROLES as readonly string[]).includes(role);
}

// Rutas que el rol "team" no puede abrir (páginas y APIs). Las de cron y Slack
// ya están fuera del middleware y se protegen con su propio secreto.
const LEADER_ONLY_PREFIXES = [
  "/dashboard",
  "/l10",
  "/api/l10",
  "/api/weekly",
  "/api/report",
  "/api/sync",
  "/api/plan",
  "/api/quarterly/transition",
  // El equipo ve en lectura: no crea ni edita Rocks, entradas ni roles.
  "/api/rocks",
  "/api/scorecard",
  "/api/accountability-chart",
];

export function isLeaderOnlyPath(pathname: string): boolean {
  return LEADER_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Dominio permitido para entrar con Google.
export function allowedEmailDomain(): string {
  return (process.env.AUTH_ALLOWED_DOMAIN ?? "mawi.io").trim().toLowerCase();
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${allowedEmailDomain()}`);
}

export function googleLoginEnabled(): boolean {
  return !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

// Página de inicio según el rol.
export function homePathFor(role: string | null | undefined): string {
  return role === "ceo" ? "/dashboard" : "/empresa";
}
