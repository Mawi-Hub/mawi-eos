import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!login|api/auth|api/health|api/checkin|api/l10/cron|share|_next/static|_next/image|favicon.ico).*)",
  ],
};
