import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

// Los archivos públicos (logos e imágenes) se sirven sin sesión: la pantalla de
// login los necesita antes de que haya una.
export const config = {
  matcher: [
    "/((?!login|api/auth|api/health|api/checkin|api/l10/cron|api/l10/digest|api/sync/cron|api/weekly/cron|share|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
