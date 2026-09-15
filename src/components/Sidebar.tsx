"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Layers, List, Split, FileText, Users, ScrollText, LogOut, Menu, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { withBase } from "@/lib/basePath";
import { signOutAction } from "@/app/dashboard/actions";
import packageJson from "../../package.json";

const APP_VERSION = packageJson.version;

interface NavItem {
  href: string;
  /** Faollikni aniqlash uchun prefiks (`href` dan farq qilishi mumkin). */
  match: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  superOnly?: boolean;
  /** Hudud moderatoriga ko'rinmaydi (u faqat ro'yxatni ko'radi). */
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", label: "Umumiy ko'rinish", icon: LayoutDashboard, exact: true, adminOnly: true },
  { href: "/dashboard/kanal/vat", match: "/dashboard/kanal", label: "Kanallar", icon: Layers, adminOnly: true },
  { href: "/dashboard/royxat", match: "/dashboard/royxat", label: "To'lovlar ro'yxati", icon: List },
  // Hozircha faqat adminlar (foydalanuvchi qarori, 2026-09-15).
  { href: "/dashboard/taqsimot", match: "/dashboard/taqsimot", label: "Taqsimot", icon: Split, adminOnly: true },
  { href: "/dashboard/shartnomalar", match: "/dashboard/shartnomalar", label: "Shartnomalar", icon: FileText, adminOnly: true },
  { href: "/dashboard/users", match: "/dashboard/users", label: "Foydalanuvchilar", icon: Users, superOnly: true },
  { href: "/dashboard/audit", match: "/dashboard/audit", label: "Audit", icon: ScrollText, superOnly: true },
];

const SIDEBAR_BG = "linear-gradient(180deg, var(--navy) 0%, var(--navy-mid) 100%)";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return chars || "?";
}

export function Sidebar({
  user,
  isSuperAdmin,
  isModerator,
}: {
  user: { name: string; username: string; roleLabel: string };
  /** ⚠️ Ikkalasi faqat menyu ko'rinishi uchun — haqiqiy himoya sahifaning o'zida (`lib/authz.ts`). */
  isSuperAdmin: boolean;
  isModerator: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const items = NAV.filter((n) => (!n.superOnly || isSuperAdmin) && (!n.adminOnly || !isModerator));

  const inner = (
    <>
      <div className="grid place-items-start gap-3 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBase("/logo-dm-light.svg")} alt="Davlat mulki" className="h-10 w-auto shrink-0" />
        <p className="pl-10 text-[16px] font-bold" style={{ color: "var(--gold)" }}>
          To&apos;lovlar
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map(({ href, match, label, icon: Icon, exact }) => {
          const active = exact ? pathname === match : pathname.startsWith(match);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon
                className={cn("h-[18px] w-[18px] shrink-0", !active && "text-white/50 group-hover:text-white/80")}
                style={active ? { color: "var(--gold)" } : undefined}
              />
              <span className="truncate">{label}</span>
              {active ? <span className="ml-auto h-5 w-1 shrink-0 rounded-full" style={{ background: "var(--gold)" }} /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="mb-2 pr-2 text-right font-mono text-[12px] text-white/50">v{APP_VERSION}</p>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
            {initials(user.name || user.username)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name || user.username}</p>
            <p className="truncate text-[11px] text-white/50">{user.roleLabel}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              title="Chiqish"
              className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 shadow-md md:hidden"
        style={{ background: "var(--navy)" }}
      >
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={withBase("/logo-short-light.svg")} alt="Davlat mulki" className="h-8 w-auto" />
          <span className="text-sm font-semibold text-white">To&apos;lovlar</span>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Menyuni ochish">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col shadow-2xl transition-transform duration-200 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ background: SIDEBAR_BG }}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-4 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Menyuni yopish"
        >
          <X className="h-4 w-4" />
        </button>
        {inner}
      </aside>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col md:flex" style={{ background: SIDEBAR_BG }}>
        {inner}
      </aside>
    </>
  );
}
