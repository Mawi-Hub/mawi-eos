"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatKPIValue, formatKPIValueFull, type KPIDirection } from "@/lib/plan/calculations";

const MONTH_LABELS: Record<number, string> = {
  0: "Ene", 1: "Feb", 2: "Mar", 3: "Abr", 4: "May", 5: "Jun",
  6: "Jul", 7: "Ago", 8: "Sep", 9: "Oct", 10: "Nov", 11: "Dic",
};

export function PlanKPIChart({
  entries,
  target,
  unit,
  direction,
  height = 220,
}: {
  entries: { period: string | Date; projected: number; actual: number | null }[];
  target: number;
  unit: string;
  direction: KPIDirection;
  height?: number;
}) {
  const data = entries.map((e) => {
    const d = new Date(e.period);
    return {
      month: MONTH_LABELS[d.getUTCMonth()],
      projected: e.projected,
      actual: e.actual,
      delta:
        e.actual !== null
          ? direction === "ABOVE"
            ? ((e.actual - e.projected) / e.projected) * 100
            : ((e.projected - e.actual) / e.projected) * 100
          : null,
    };
  });

  const lastActualColor = (() => {
    const lastReal = [...data].reverse().find((d) => d.actual !== null);
    if (!lastReal || lastReal.delta === null) return "#22c55e";
    if (lastReal.delta >= 0) return "#22c55e";
    if (lastReal.delta >= -10) return "#f59e0b";
    return "#ef4444";
  })();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
        <YAxis
          stroke="#9ca3af"
          fontSize={12}
          tickFormatter={(v: number) => formatKPIValue(v, unit)}
        />
        <Tooltip
          formatter={(value, name) => {
            const num = typeof value === "number" ? value : null;
            return [
              num === null ? "—" : formatKPIValueFull(num, unit),
              name === "projected" ? "Proyectado" : "Real",
            ];
          }}
          labelFormatter={(label) => `Mes: ${String(label)}`}
        />
        <ReferenceLine
          y={target}
          stroke="#7c3aed"
          strokeDasharray="3 3"
          label={{ value: "Meta", position: "right", fontSize: 11, fill: "#7c3aed" }}
        />
        <Line
          type="monotone"
          dataKey="projected"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          dot={{ r: 3, fill: "#94a3b8" }}
          name="projected"
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke={lastActualColor}
          strokeWidth={2}
          dot={{ r: 4, fill: lastActualColor }}
          connectNulls={false}
          name="actual"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
