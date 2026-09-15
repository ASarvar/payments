import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dmy, nf, sum } from "@/lib/format";
import { CHANNELS } from "@/lib/channels";
import { TONE_CLS } from "@/lib/uzasbo";
import type { ChannelDist, Distribution } from "@/server/services/taqsimot";
import { th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";

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

export function Chip({ tone, children, title }: { tone: keyof typeof TONE_CLS; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium", TONE_CLS[tone])}>
      {children}
    </span>
  );
}

// ── Hujjatning kanallar bo'yicha taqsimoti (Taqsimot sahifasi + hujjatlar ro'yxatidagi ochiladigan qator) ──

const ZERO: Omit<ChannelDist, "key" | "label" | "lastPaid"> = { share: 0, accepted: 0, included: 0, paid: 0, noSend: 0, extraPaid: 0 };

/** Faqat ulushi (yoki belgisi/to'lovi) bor kanallar. */
const shownChannels = (d: Distribution) => d.channels.filter((c) => c.share > 0 || c.included > 0 || c.paid > 0);

export function ChannelsSubtitle({ d }: { d: Distribution }) {
  const spread = d.attached.s - d.channelsSum;
  return (
    <>
      Kanallarga taqsimlangan jami: <strong>{sum(d.channelsSum)}</strong> so&apos;m
      {Math.abs(spread) >= 1 ? <span className="text-amber-800"> · qismlar summasidan farqi {sum(spread)} so&apos;m</span> : null}
      {shownChannels(d).length < CHANNELS.length ? <> · qolgan kanallarga ulush yo&apos;q</> : null}
    </>
  );
}

export function ChannelsTable({ d }: { d: Distribution }) {
  const channels = shownChannels(d);
  const tot = channels.reduce(
    (a, c) => ({
      share: a.share + c.share,
      accepted: a.accepted + c.accepted,
      included: a.included + c.included,
      paid: a.paid + c.paid,
      noSend: a.noSend + c.noSend,
      extraPaid: a.extraPaid + c.extraPaid,
    }),
    ZERO,
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className={th}>Kanal</th>
            <th className={thR}>Ulush</th>
            <th className={thR}>Tasdiqlangan</th>
            <th className={thR}>Topshiriqnomaga kiritilgan</th>
            <th className={thR}>G&apos;aznachilikda to&apos;langan</th>
            <th className={thR}>To&apos;lanmagan</th>
            <th className={th}>Oxirgi to&apos;lov</th>
            <th className={th}>Izoh</th>
          </tr>
        </thead>
        <tbody>
          <tr className={totalRow} style={totalStyle}>
            <td className={td}>J A M I</td>
            <td className={tdR}>{sum(tot.share)}</td>
            <td className={tdR}>{sum(tot.accepted)}</td>
            <td className={tdR}>{sum(tot.included)}</td>
            <td className={tdR}>{sum(tot.paid)}</td>
            <td className={tdR}>{sum(Math.max(0, tot.share - tot.paid))}</td>
            <td className={td} />
            <td className={td} />
          </tr>
          {channels.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                Hujjat birorta kanalga taqsimlanmagan (faol qismi yo&apos;q).
              </td>
            </tr>
          ) : null}
          {channels.map((c) => (
            <tr key={c.key} className="border-b border-border last:border-0">
              <td className={`${td} font-medium`}>{c.label}</td>
              <td className={tdR}>{sum(c.share)}</td>
              <td className={tdR}>{sum(c.accepted)}</td>
              <td className={tdR}>{sum(c.included)}</td>
              <td className={cn(tdR, c.paid > 0 && "text-emerald-700")}>{sum(c.paid)}</td>
              <td className={cn(tdR, c.share - c.paid >= 1 && "font-semibold text-amber-800")}>{sum(Math.max(0, c.share - c.paid))}</td>
              <td className={`${td} whitespace-nowrap tabular-nums`}>{dmy(c.lastPaid)}</td>
              <td className={td}>
                <div className="flex flex-wrap gap-1">
                  {c.extraPaid > 0 ? <Chip tone="bad">ikki marta to&apos;langan: {sum(c.extraPaid)}</Chip> : null}
                  {c.noSend > 0 ? (
                    <Chip tone="bad" title="sent_* belgisi qo'yilgan, lekin bu ulush hech bir topshiriqnomada yo'q">
                      belgi bor, topshiriqnoma yo&apos;q: {sum(c.noSend)}
                    </Chip>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
