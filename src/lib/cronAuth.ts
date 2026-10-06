import crypto from "crypto";
import { NextResponse } from "next/server";

// Guard de los endpoints de cron. Falla cerrado: sin CRON_SECRET configurado o
// con un Authorization distinto, responde 401. Los endpoints de cron están
// excluidos del middleware de sesión, así que este es su único control.
//
// Vercel manda `Authorization: Bearer <CRON_SECRET>` cuando la variable existe.
export function checkCronAuth(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorizationHeader) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorizationHeader);
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

// null = autorizado. Si no, la respuesta 401 lista para devolver.
export function requireCronAuth(request: Request): NextResponse | null {
  if (checkCronAuth(request.headers.get("authorization"))) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
