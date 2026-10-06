// Ayudas para pruebas con base de datos. Las pruebas de integración SOLO corren
// contra un Postgres local: si DATABASE_URL apunta a otro host (p. ej. Supabase)
// se niegan a ejecutar, para que nunca escriban en producción.

export function testDatabaseUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" ? url : null;
  } catch {
    return null;
  }
}

// Úsalo como `{ skip: !dbAvailable }` en node:test. Fija DATABASE_URL al
// destino local antes de importar el cliente de Prisma.
export const dbAvailable = (() => {
  const url = testDatabaseUrl();
  if (url) process.env.DATABASE_URL = url;
  return url !== null;
})();
