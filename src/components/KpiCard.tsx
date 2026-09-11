import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Asosiy ko'rsatkich kartasi (obyektlar monitoringidagi bilan bir xil ko'rinish).
 * ⚠️ `accent` 6 xonali hex bo'lishi shart — hover fonlari alfa qo'shib quriladi.
 * ⚠️ `href` dagi filtr kartadagi son bilan AYNAN bir xil mezonda bo'lishi shart.
 */
export function KpiCard({
  label,
  value,
  unit,
  footer,
  accent,
  href,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  footer?: ReactNode;
  accent: string;
  href?: string;
  icon?: LucideIcon;
}) {
  const vars = {
    "--kpi-accent": accent,
    "--kpi-shadow": `${accent}4d`,
    "--kpi-tint": `${accent}14`,
  } as CSSProperties;

  const body = (
    <div
      style={vars}
      className="group/kpi relative h-full overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[color:var(--kpi-accent)] hover:shadow-[0_10px_24px_-12px_var(--kpi-shadow)]"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] transition-all duration-200 group-hover/kpi:w-1.5" style={{ background: accent }} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="pt-0.5 text-[11.5px] font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: "var(--kpi-tint)", color: accent }}>
            <Icon className="size-[18px]" />
          </span>
        ) : null}
      </div>
      <p className="relative mt-2 text-2xl font-bold leading-none tracking-tight" style={{ color: "var(--navy)" }}>
        {value}
        {unit ? <span className="ml-1 text-[13px] font-semibold text-muted-foreground">{unit}</span> : null}
      </p>
      {footer ? <div className="relative mt-2 text-[11.5px] text-muted-foreground">{footer}</div> : null}
      {href ? (
        <ArrowUpRight
          aria-hidden
          className="absolute bottom-3 right-3 size-4 translate-x-1 opacity-0 transition-all duration-200 group-hover/kpi:translate-x-0 group-hover/kpi:opacity-100"
          style={{ color: accent }}
        />
      ) : null}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
      {body}
    </Link>
  );
}
