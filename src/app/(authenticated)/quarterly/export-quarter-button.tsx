"use client";

export function ExportQuarterButton({ quarterId, label }: { quarterId: string; label: string }) {
  return (
    <a
      href={`/api/quarterly/${quarterId}/export`}
      download
      className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
    >
      Descargar {label}
    </a>
  );
}
