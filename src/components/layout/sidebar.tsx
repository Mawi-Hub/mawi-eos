"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  Mountain,
  Trophy,
  Calendar,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "CEO Dashboard", icon: LayoutDashboard, ceoOnly: true },
  { href: "/scorecard", label: "Scorecard", icon: Target, ceoOnly: false },
  { href: "/rocks", label: "Rocks", icon: Mountain, ceoOnly: false },
  { href: "/wins-challenges", label: "Wins & Challenges", icon: Trophy, ceoOnly: false },
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
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-mawi-50 text-mawi-800"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive ? "text-mawi-600" : "")} />
              {item.label}
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
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="text-gray-400 hover:text-gray-600">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
