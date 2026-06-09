"use client";

import { useEffect, useState } from "react";
import { formatKPIValueFull, type KPIDirection } from "@/lib/plan/calculations";

type KPI = {
  slug: string;
  target: number;
  baseline?: number;
  unit: string;
  direction: KPIDirection;
};

const LEVERS = [
  {
    n: 1,
    title: "Reducir Churn",
    subtitle: "CCR 7% → 3%",
    tag: "Retención",
    border: "border-rose-300/15",
    accentLine: "via-rose-400/70",
    tagColor: "text-rose-200/90",
    numColor: "text-rose-300/40",
  },
  {
    n: 2,
    title: "Escalar Expansión",
    subtitle: "Repricing + upselling",
    tag: "Expansión",
    border: "border-emerald-300/15",
    accentLine: "via-emerald-400/70",
    tagColor: "text-emerald-200/90",
    numColor: "text-emerald-300/40",
  },
  {
    n: 3,
    title: "Crecer Adquisición",
    subtitle: "30 clientes nuevos / mes",
    tag: "Adquisición",
    border: "border-mawi-200/20",
    accentLine: "via-mawi-300/70",
    tagColor: "text-mawi-200/90",
    numColor: "text-mawi-200/40",
  },
];

function getRemaining(endMs: number) {
  const diff = Math.max(0, endMs - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function Plan3Palancas({
  kpis,
  endDate,
}: {
  kpis: KPI[];
  endDate: Date;
}) {
  const ndr = kpis.find((k) => k.slug === "ndr");
  const endMs = endDate.getTime();

  const [remaining, setRemaining] = useState(() => getRemaining(endMs));
  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining(endMs)), 1000);
    return () => clearInterval(id);
  }, [endMs]);

  const deadlineLabel = endDate.toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0a0510] px-6 py-12 text-white shadow-2xl shadow-mawi-950/40 md:px-12 md:py-16">
      {/* Atmospheric layers */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-mawi-900/70 via-transparent to-mawi-600/15" />
      <div
        className="pointer-events-none absolute -top-32 right-1/4 h-[28rem] w-[28rem] rounded-full bg-mawi-500/25 blur-[140px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-10 h-96 w-96 rounded-full bg-mawi-700/40 blur-[120px]"
        aria-hidden
      />
      {/* Fine grain dot pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
        aria-hidden
      />
      {/* Top hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mawi-400/40 to-transparent" />

      <div className="relative">
        {/* Eyebrow */}
        <div className="mb-10 flex flex-wrap items-center justify-between gap-3 md:mb-14">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-mawi-100/80">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            H2 2026 · Live
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.3em] text-mawi-200/50">
            Mawi · Plan de Crecimiento
          </div>
        </div>

        {/* Twin stats — countdown + NDR */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1fr_auto_1fr] md:items-end md:gap-14">
          {/* Days countdown */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-mawi-200/70">
              Días para la meta
            </div>
            <div
              className="mt-3 flex items-baseline gap-3"
              suppressHydrationWarning
            >
              <span
                className="font-mono text-[6.5rem] font-bold leading-[0.85] tracking-tighter text-white md:text-[10rem]"
                style={{
                  textShadow:
                    "0 0 80px rgba(167,130,214,0.35), 0 0 20px rgba(167,130,214,0.2)",
                }}
                aria-label={`${remaining.days} días`}
              >
                {remaining.days}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-mawi-200/90">
                días
              </span>
            </div>
            <div
              className="mt-4 flex items-center gap-2 font-mono text-xs text-mawi-200/60 md:text-sm"
              suppressHydrationWarning
            >
              <span className="tabular-nums">
                {pad(remaining.hours)}h {pad(remaining.minutes)}m{" "}
                <span className="text-emerald-300/80">{pad(remaining.seconds)}s</span>
              </span>
              <span className="text-mawi-200/40">·</span>
              <span className="uppercase tracking-[0.2em]">
                hasta {deadlineLabel}
              </span>
            </div>
          </div>

          {/* Hairline divider */}
          <div
            className="hidden h-36 w-px self-end bg-gradient-to-b from-transparent via-mawi-300/40 to-transparent md:block"
            aria-hidden
          />

          {/* North Star */}
          {ndr && (
            <div className="md:text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-mawi-200/70">
                ★ North Star · NDR
              </div>
              <div className="mt-3 flex items-baseline gap-3 md:justify-end">
                <span
                  className="font-mono text-[6.5rem] font-bold leading-[0.85] tracking-tighter text-white md:text-[10rem]"
                  style={{
                    textShadow:
                      "0 0 80px rgba(167,130,214,0.35), 0 0 20px rgba(167,130,214,0.2)",
                  }}
                >
                  {formatKPIValueFull(ndr.target, ndr.unit)}
                </span>
              </div>
              <div className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-mawi-200/60 md:text-sm">
                Meta diciembre · base{" "}
                <span className="text-white/80">
                  {ndr.baseline !== undefined
                    ? formatKPIValueFull(ndr.baseline, ndr.unit)
                    : "—"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Levers */}
        <div className="mt-14 grid grid-cols-1 gap-3 md:mt-16 md:grid-cols-3">
          {LEVERS.map((lever) => (
            <div
              key={lever.n}
              className={`group relative overflow-hidden rounded-xl border ${lever.border} bg-white/[0.03] p-5 backdrop-blur-sm transition hover:bg-white/[0.06]`}
            >
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${lever.accentLine} to-transparent`}
              />
              <div className="flex items-baseline justify-between">
                <span
                  className={`font-mono text-3xl font-light ${lever.numColor}`}
                >
                  0{lever.n}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.25em] ${lever.tagColor}`}
                >
                  {lever.tag}
                </span>
              </div>
              <div className="mt-4 text-base font-semibold text-white">
                {lever.title}
              </div>
              <div className="mt-1 text-xs text-white/55">{lever.subtitle}</div>
            </div>
          ))}
        </div>

        {/* Bottom hairline */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-mawi-400/20 to-transparent" />
      </div>
    </section>
  );
}
