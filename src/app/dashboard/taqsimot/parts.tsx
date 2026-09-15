import Link from "next/link";
import { cn } from "@/lib/utils";
import { nf } from "@/lib/format";

const TABS = [
  { key: "hujjat", href: "/dashboard/taqsimot", label: "Hujjat bo'yicha" },
  { key: "biriktirish", href: "/dashboard/taqsimot/biriktirish", label: "Biriktirish borishi" },
  { key: "muammoli", href: "/dashboard/taqsimot/muammoli", label: "Muammoli hujjatlar" },
  { key: "takroriy", href: "/dashboard/taqsimot/takroriy", label: "Ikki marta to'langan" },
] as const;

export type TaqsimotTab = (typeof TABS)[number]["key"];

/** Taqsimot bo'limi ichidagi yorliqlar. */
export function TaqsimotNav({ active }: { active: TaqsimotTab }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-1.5">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition",
            t.key === active ? "border-transparent text-white" : "border-border bg-card text-slate-600 hover:bg-muted",
          )}
          style={t.key === active ? { background: "var(--navy)" } : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Yo'l ko'rsatkichi: Respublika → hudud → hujjatlar. Oxirgisi — joriy sahifa (havolasiz). */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden>›</span> : null}
          {it.href ? (
            <Link href={it.href} className="hover:underline" style={{ color: "var(--cobalt)" }}>
              {it.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-700">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Sahifalash (ro'yxat sahifasidagi bilan bir xil ko'rinish). */
export function Pager({
  page,
  pages,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  hrefFor: (p: number) => string;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        {nf((page - 1) * pageSize + 1)}–{nf(Math.min(page * pageSize, total))} / {nf(total)}
      </span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted">
            ← Oldingi
          </Link>
        ) : null}
        <span className="px-2 text-muted-foreground">
          {nf(page)} / {nf(pages)}
        </span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted">
            Keyingi →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
