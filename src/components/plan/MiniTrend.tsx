"use client";

import { LineChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatKPIValueFull } from "@/lib/plan/calculations";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type TrendEntry = { period: string; projected: number; actual: number | null };

// Mini gráfica por fila: línea punteada = esperado según el plan, línea sólida
// = real, raya morada = meta. Es la versión compacta de la gráfica del detalle.
export function MiniTrend({ entries, target, unit }: { entries: TrendEntry[]; target: number | null; unit: string }) {
  if (entries.length === 0) return <span className="text-xs text-gray-300">—</span>;
  const data = entries.map((e) => ({ month: MONTHS[new Date(e.period).getUTCMonth()], projected: e.projected, actual: e.actual }));
  const values = data.flatMap((d) => [d.projected, d.actual, target]).filter((v): v is number => typeof v === "number");
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;

  return (
    <div className="h-10 w-36">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="month" hide />
          <YAxis hide domain={[min - pad, max + pad]} />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: "4px 8px" }}
            formatter={(value, name) => [typeof value === "number" ? formatKPIValueFull(value, unit) : "—", name === "projected" ? "Esperado" : "Real"]}
            labelFormatter={(label) => String(label)}
          />
          {target !== null && <ReferenceLine y={target} stroke="#7c3aed" strokeDasharray="2 3" strokeOpacity={0.6} />}
          <Line type="monotone" dataKey="projected" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="actual" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
