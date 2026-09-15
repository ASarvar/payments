import Link from "next/link";
import { nf, sum } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Diqqat talab qiladi" kartasi: soni + summasi, noldan katta bo'lsa qizil. `failed` — so'rov
 * yiqilgan (qolgan sahifa baribir ko'rinadi), `n === undefined` — hali hisoblanmagan.
 */
export function IssueTile({
  title,
  n,
  s,
  href: to,
  failed,
  note,
}: {
  title: string;
  n?: number;
  s?: number;
  href: string;
  failed?: string;
  /** Kichik izoh (masalan "barcha davr"). */
  note?: string;
}) {
  const bad = (n ?? 0) > 0;
  return (
    <Link
      href={to}
      className={cn(
        "block rounded-xl border p-3 transition hover:shadow-sm",
        bad ? "border-red-200 bg-red-50/60 hover:border-red-300" : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <p className="text-[11.5px] font-medium text-muted-foreground">
        {title}
        {note ? <span className="font-normal"> · {note}</span> : null}
      </p>
      {failed ? (
        <p className="mt-1 text-[12px] text-amber-800">{failed}</p>
      ) : n === undefined ? (
        <p className="mt-1 text-[12px] text-muted-foreground">hisoblanmoqda…</p>
      ) : (
        <p className={cn("mt-1 text-lg font-bold", bad ? "text-red-700" : "text-slate-700")}>
          {nf(n)} ta <span className="text-[12px] font-medium text-muted-foreground">· {sum(s ?? 0)} so&apos;m</span>
        </p>
      )}
    </Link>
  );
}
