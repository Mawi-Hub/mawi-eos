"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

const HIGHLIGHTS = [
  { title: "Cómo va Mawi", text: "Métricas norte, Rocks y KPIs de cada área, al día." },
  { title: "Check-in semanal", text: "Cada persona cuenta su aporte; el viernes sale el resumen." },
  { title: "Rocks y Scorecard", text: "Las prioridades del trimestre y cómo vamos contra la meta." },
];

export default function LoginForm({ googleEnabled, error: initialError }: { googleEnabled: boolean; error: string | null }) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState<"google" | "password" | null>(null);
  // Si Google no está configurado, el formulario con contraseña se muestra abierto.
  const [showPassword, setShowPassword] = useState(!googleEnabled);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading("password");
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });

    if (result?.error) {
      setError("Email o contraseña incorrectos");
      setLoading(null);
    } else {
      // La raíz decide el inicio según el rol (CEO → Vista CEO, resto → Cómo va Mawi).
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-full bg-mawi-950">
      {/* Panel de marca (pantallas medianas o grandes) */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-mawi-950 via-mawi-800 to-mawi-600 p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-mawi-400/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-mawi-500/20 blur-3xl" />
        <Image src="/mawi-logo-white.svg" alt="Mawi" width={132} height={36} priority />
        <div className="relative mt-auto max-w-md">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-mawi-200">Mawi EOS</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">Cómo va Mawi, cada semana.</h1>
          <p className="mt-4 text-base text-mawi-100">
            El sistema donde el equipo ve el avance de la empresa y cuenta su aporte a la misión.
          </p>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-mawi-300" />
                <div>
                  <div className="font-medium">{h.title}</div>
                  <div className="text-sm text-mawi-200">{h.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-mawi-300">© {new Date().getFullYear()} Mawi</p>
      </aside>

      {/* Acceso */}
      <main className="flex flex-1 items-center justify-center bg-mawi-950 px-4 py-10 lg:bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <Image src="/mawi-logo-white.svg" alt="Mawi" width={132} height={36} className="mx-auto" priority />
            <p className="mt-3 text-sm text-mawi-200">Cómo va Mawi, cada semana.</p>
          </div>

          <div className="rounded-2xl bg-white p-7 shadow-xl ring-1 ring-black/5">
            <div className="flex items-center gap-3">
              <Image src="/mawi-icon.svg" alt="" width={32} height={32} />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Entrá a Mawi EOS</h2>
                <p className="text-xs text-gray-500">Con tu cuenta de Google de Mawi.</p>
              </div>
            </div>

            <button
              type="button"
              disabled={!googleEnabled || loading !== null}
              onClick={() => {
                setLoading("google");
                void signIn("google", { callbackUrl: "/" });
              }}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-mawi-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-mawi-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-mawi-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
                <GoogleIcon />
              </span>
              {loading === "google" ? "Conectando con Google…" : "Continuar con Google"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-400">
              {googleEnabled ? "Solo cuentas @mawi.io" : "El acceso con Google se está configurando. Entrá con email y contraseña."}
            </p>

            {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="mt-6 flex items-center gap-3 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              {showPassword ? "con email y contraseña" : (
                <button type="button" onClick={() => setShowPassword(true)} className="font-medium text-mawi-700 hover:underline">
                  Entrar con email y contraseña
                </button>
              )}
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            {showPassword && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
                    placeholder="tu@mawi.io"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">Contraseña</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading !== null}
                  className="w-full rounded-xl border border-mawi-200 bg-white px-4 py-2.5 text-sm font-medium text-mawi-800 hover:bg-mawi-50 disabled:opacity-50"
                >
                  {loading === "password" ? "Ingresando…" : "Ingresar"}
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-mawi-300 lg:text-gray-400">¿Problemas para entrar? Escribile a Sergio.</p>
        </div>
      </main>
    </div>
  );
}
