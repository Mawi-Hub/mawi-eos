import type { KPIStatus } from "@/lib/plan/calculations";

const STYLES: Record<KPIStatus, { label: string; className: string }> = {
  on_track: { label: "On Track", className: "bg-emerald-100 text-emerald-800" },
  riesgo: { label: "Riesgo", className: "bg-amber-100 text-amber-800" },
  off_track: { label: "Off Track", className: "bg-red-100 text-red-800" },
  pending: { label: "Pendiente", className: "bg-gray-100 text-gray-600" },
};

export function PlanSemaforo({ status }: { status: KPIStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
