"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Target,
  Mountain,
  Trophy,
  Calendar,
  Users,
  Network,
  Compass,
  BookOpen,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "CEO Dashboard", icon: LayoutDashboard, ceoOnly: true },
  { href: "https://app.notion.com/p/3a59223bd33080f9a8bff8d161512f59", label: "Handbook", icon: BookOpen, ceoOnly: false },
  { href: "/plan", label: "Plan H2", icon: Compass, ceoOnly: false },
  { href: "/scorecard", label: "Scorecard", icon: Target, ceoOnly: false },
  { href: "/rocks", label: "Rocks", icon: Mountain, ceoOnly: false },
  { href: "/wins-challenges", label: "Wins", icon: Trophy, ceoOnly: false },
  { href: "/l10", label: "L10 Meeting", icon: Users, ceoOnly: false },
  { href: "/accountability-chart", label: "Accountability Chart", icon: Network, ceoOnly: false },
  { href: "/quarterly", label: "Trimestres", icon: Calendar, ceoOnly: false },
];

export function Sidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();

  const filteredNav = nav.filter((item) => !item.ceoOnly || userRole === "ceo");

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-5">
        <Image src="/mawi-icon.svg" alt="Mawi" width={28} height={28} />
        <div>
          <div className="text-sm font-semibold text-mawi-800">Mawi EOS</div>
          <div className="text-xs text-gray-400">Management System</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNav.map((item) => {
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
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-mawi-50 text-mawi-800"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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
              .join("")}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">{userName}</div>
            <div className="text-xs capitalize text-gray-400">{userRole}</div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-gray-400 hover:text-gray-600">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
