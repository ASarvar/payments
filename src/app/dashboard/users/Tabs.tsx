import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "users", href: "/dashboard/users", label: "Foydalanuvchilar" },
  { key: "rollar", href: "/dashboard/users/rollar", label: "Rollar" },
] as const;

export function UsersTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="mb-5 flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            t.key === active ? "border-[var(--cobalt)] text-[var(--navy)]" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
