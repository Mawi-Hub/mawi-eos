import { googleLoginEnabled } from "@/lib/access";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

// Auth.js manda ?error=AccessDenied cuando el correo no es del dominio de la empresa.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error === "AccessDenied" ? "Entrá con tu cuenta de Google @mawi.io." : error ? "No se pudo iniciar sesión. Probá de nuevo." : null;
  return <LoginForm googleEnabled={googleLoginEnabled()} error={message} />;
}
