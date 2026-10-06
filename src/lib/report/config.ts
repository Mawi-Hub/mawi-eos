// Configuración del reporte de management. Todo se lee de variables de entorno
// en cada llamada (no al importar) para que las pruebas puedan cambiarlas.
//
// Nada de esto activa envíos por sí solo: publicar exige REPORT_PUBLISH_ENABLED=1
// Y un canal explícito en REPORT_CHANNEL_ID. Sin ambos, el cierre de reunión
// solo puede "cerrar sin enviar".

function flag(name: string): boolean {
  return process.env[name]?.trim() === "1";
}

export function isSelectionEnabled(): boolean {
  return flag("REPORT_SELECTION_ENABLED");
}

export function isLeaderCheckinV2(): boolean {
  return flag("LEADER_CHECKIN_V2");
}

// El resumen general del lunes sigue activo hasta que se confirme esta
// migración. Con la bandera en 1 solo se apaga ese emisor.
export function isMondayDigestReplaced(): boolean {
  return flag("REPORT_REPLACE_MONDAY_DIGEST");
}

export function reportChannel(): string | null {
  const value = process.env.REPORT_CHANNEL_ID?.trim();
  return value ? value : null;
}

export function notionParentPageId(): string | null {
  const value = process.env.REPORT_NOTION_PARENT_PAGE_ID?.trim();
  return value ? value : null;
}

export function appUrl(): string | null {
  const value = process.env.NEXTAUTH_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

// null = se puede publicar. Si no, el motivo que se muestra al cerrar.
export function publishBlocker(): string | null {
  if (!flag("REPORT_PUBLISH_ENABLED")) return "El envío no está activado (REPORT_PUBLISH_ENABLED).";
  if (!reportChannel()) return "Falta confirmar el canal de destino (REPORT_CHANNEL_ID).";
  return null;
}

// Nombres de métricas de empresa (NDR, MRR, clientes nuevos) que se pueden
// mostrar a esta audiencia, separados por coma. Vacío = no se muestran.
export function companyMetricNames(): string[] {
  return (process.env.REPORT_COMPANY_METRICS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
