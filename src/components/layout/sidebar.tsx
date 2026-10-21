"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Building2,
  Target,
  Mountain,
  Calendar,
  CalendarCheck,
  Users,
  Network,
  Compass,
  BookOpen,
  ExternalLink,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Audience = "ceo" | "leaders" | "all";

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  sales: "Ventas",
  cs: "Customer",
  product: "Producto",
  engineering: "Ingeniería",
  team: "Equipo",
};

function navFor(planLabel: string, handbookUrl: string | null) {
  const items: Array<{ href: string; label: string; icon: typeof Target; audience: Audience }> = [
    { href: "/dashboard", label: "Vista CEO", icon: LayoutDashboard, audience: "ceo" },
    { href: "/empresa", label: "Cómo va Mawi", icon: Building2, audience: "all" },
    { href: "/plan", label: planLabel, icon: Compass, audience: "all" },
    { href: "/scorecard", label: "Scorecard", icon: Target, audience: "all" },
    { href: "/rocks", label: "Rocks", icon: Mountain, audience: "all" },
    { href: "/semana", label: "Semana", icon: CalendarCheck, audience: "all" },
    { href: "/l10", label: "L10 Meeting", icon: Users, audience: "leaders" },
    { href: "/accountability-chart", label: "Equipo y roles", icon: Network, audience: "all" },
    { href: "/quarterly", label: "Trimestres", icon: Calendar, audience: "all" },
  ];
  if (handbookUrl) items.splice(2, 0, { href: handbookUrl, label: "Handbook", icon: BookOpen, audience: "all" });
  return items;
}

export function Sidebar({
  userName,
  userRole,
  isLeader,
  planLabel,
  handbookUrl,
}: {
  userName: string;
  userRole: string;
  isLeader: boolean;
  planLabel: string;
  handbookUrl: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = navFor(planLabel, handbookUrl).filter(
    (item) => item.audience === "all" || (item.audience === "leaders" && isLeader) || (item.audience === "ceo" && userRole === "ceo"),
  );

  const nav = (
    <>
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-5">
        <Image src="/mawi-icon.svg" alt="Mawi" width={28} height={28} />
        <div>
          <div className="text-sm font-semibold text-mawi-800">Mawi EOS</div>
          <div className="text-xs text-gray-400">Management System</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const isExternal = item.href.startsWith("https://");
          const isActive = !isExternal && pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              prefetch={isExternal ? false : undefined}
              aria-label={isExternal ? `${item.label} en Notion (abre en otra pestaña)` : undefined}
              // En el celular el menú se cierra al navegar.
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-mawi-50 text-mawi-800" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive ? "text-mawi-600" : "")} />
              {item.label}
              {isExternal && <ExternalLink className="ml-auto h-3.5 w-3.5" aria-hidden="true" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mawi-100 text-xs font-medium text-mawi-700">
            {userName
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-900">{userName}</div>
            <div className="text-xs text-gray-400">{ROLE_LABEL[userRole] ?? userRole}</div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Barra superior en el celular */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Abrir menú" className="text-gray-700">
          <Menu className="h-5 w-5" />
        </button>
        <Image src="/mawi-icon.svg" alt="Mawi" width={22} height={22} />
        <span className="text-sm font-semibold text-mawi-800">Mawi EOS</span>
      </div>

      {/* Menú desplegable en el celular */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/30" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Cerrar menú" className="absolute right-3 top-4 text-gray-400">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      {/* Barra lateral fija en pantallas medianas o grandes */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">{nav}</aside>
    </>
  );
}
