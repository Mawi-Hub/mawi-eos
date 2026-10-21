import type { NextAuthConfig } from "next-auth";
import { homePathFor, isLeaderOnlyPath, isLeaderRole } from "./access";

// Configuración compartida con el middleware: sin Prisma ni proveedores.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname === "/login";

      if (isOnLogin) return true;
      if (!isLoggedIn) return Response.redirect(new URL("/login", nextUrl));

      // El equipo entra en lectura: lo de managers redirige a su inicio (páginas)
      // o responde 403 (APIs).
      const role = (auth.user as { role?: string }).role;
      if (!isLeaderRole(role) && isLeaderOnlyPath(nextUrl.pathname)) {
        if (nextUrl.pathname.startsWith("/api/")) {
          return Response.json({ error: "Solo managers" }, { status: 403 });
        }
        return Response.redirect(new URL(homePathFor(role), nextUrl));
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
};
