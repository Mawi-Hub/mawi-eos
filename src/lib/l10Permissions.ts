import { prisma } from "@/lib/db";

// Quién puede operar el ciclo de vida del L10: crear, abrir, mover de fase y
// cerrar. El CEO siempre puede; además cualquiera marcado como facilitador.
//
// Se consulta contra la base y no contra la sesión a propósito: el token de
// next-auth es un JWT en cookie, así que un flag guardado ahí quedaría viejo
// hasta el siguiente login.
export async function canManageMeetings(user?: { id?: string; role?: string }): Promise<boolean> {
  if (!user?.id) return false;
  if (user.role === "ceo") return true;

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isFacilitator: true },
  });
  return row?.isFacilitator ?? false;
}
