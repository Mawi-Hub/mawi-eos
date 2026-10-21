import crypto from "crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { authConfig } from "./auth.config";
import { googleLoginEnabled, isAllowedEmail, TEAM_ROLE } from "./access";

// Quien entra con Google por primera vez queda como "team" (lectura). Los
// managers ya existentes conservan su rol: se los reconoce por email.
async function userForGoogle(email: string, name: string | null | undefined) {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: normalized,
      name: name?.trim() || normalized.split("@")[0],
      role: TEAM_ROLE,
      // No tiene contraseña: solo puede entrar con Google.
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
    },
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      // Solo cuentas verificadas del dominio de la empresa.
      return profile?.email_verified === true && isAllowedEmail(profile.email);
    },
    async jwt(params) {
      const { token, account, profile } = params;
      if (account?.provider === "google" && profile?.email) {
        const user = await userForGoogle(profile.email, profile.name);
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
        return token;
      }
      return authConfig.callbacks!.jwt!(params);
    },
  },
  providers: [
    ...(googleLoginEnabled() ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })] : []),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;

          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          if (!user) {
            console.log("[auth] User not found:", credentials.email);
            return null;
          }

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );

          if (!isValid) {
            console.log("[auth] Invalid password for:", credentials.email);
            return null;
          }

          console.log("[auth] Login success:", credentials.email);
          return { id: user.id, email: user.email, name: user.name, role: user.role };
        } catch (error) {
          console.error("[auth] Error during authorize:", error);
          return null;
        }
      },
    }),
  ],
});
