import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CATEGORIES: Record<string, { label: string; color: string }> = {
  revenue_health: { label: "Revenue Health", color: "bg-mawi-600" },
  sales_health: { label: "Sales Health", color: "bg-amber-500" },
  customer_success: { label: "Customer Success", color: "bg-green-500" },
  product_engineering: { label: "Product + Engineering", color: "bg-purple-500" },
  financial_health: { label: "Financial Health", color: "bg-rose-500" },
};

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  on_track: { label: "On Track", className: "bg-emerald-100 text-emerald-800" },
  off_track: { label: "Off Track", className: "bg-red-100 text-red-800" },
  riesgo: { label: "Riesgo", className: "bg-amber-100 text-amber-800" },
  pending: { label: "Pendiente", className: "bg-gray-100 text-gray-600" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-800" },
  not_done: { label: "Not Done", className: "bg-red-100 text-red-800" },
};

export const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  alto: { label: "Alto", className: "bg-red-100 text-red-800" },
  medio: { label: "Medio", className: "bg-amber-100 text-amber-800" },
  bajo: { label: "Bajo", className: "bg-green-100 text-green-800" },
};

export function calculateStatus(actual: number | null, target: number | null, direction: string): string {
  if (actual === null || target === null) return "pending";

  let ratio: number;
  if (direction === "above") {
    ratio = actual / target;
    if (ratio >= 1) return "on_track";
    if (ratio >= 0.85) return "riesgo";
    return "off_track";
  } else if (direction === "below") {
    ratio = target / actual;
    if (actual <= target) return "on_track";
    if (ratio >= 0.85) return "riesgo";
    return "off_track";
  }
  return actual === target ? "on_track" : "off_track";
}
