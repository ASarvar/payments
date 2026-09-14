import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { refreshDataAction } from "@/app/dashboard/actions";
import { getCurrentUser, isModerator } from "@/lib/authz";

// Jadval klasslari — hamma sahifada bir xil ko'rinish.
export const th = "px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
export const thR = `${th} text-right`;
export const td = "px-3 py-2 align-top text-[13px] text-slate-700";
export const tdR = `${td} whitespace-nowrap text-right tabular-nums`;
/** JAMI qatori — birinchi, oltin fonda (obyektlar hisobotidagi uslub). */
export const totalRow = "border-b border-border font-semibold";
export const totalStyle = { background: "var(--gold-lighter)" } as const;

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--navy)" }}>
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <RefreshButton />
      </div>
    </div>
  );
}

/**
 * "Yangilash" — faqat moderator EMASlarga (`refreshDataAction` ham `requireAdmin` bilan
 * tekshiradi). Qaror shu yerda — sahifalar uni prop bilan eslab qolishi shart emas.
 */
async function RefreshButton() {
  const user = await getCurrentUser();
  if (!user || isModerator(user)) return null;
  return (
    <form action={refreshDataAction}>
      <button
        type="submit"
        title="Keshni tashlab, bazadan qayta hisoblash"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-600 transition hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" />
        Yangilash
      </button>
    </form>
  );
}

export function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--navy)" }}>
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">To&apos;lovlar bazasi sozlanmagan</p>
        <p className="mt-1">
          <code>PROJECT_DATABASE_URL</code> (yoki <code>DB_HOST</code>/<code>DB_NAME</code>/<code>DB_USER</code>/
          <code>DB_PASSWORD</code>) berilmagan — <code>.env.production.example</code> ga qarang.
        </p>
      </div>
    </div>
  );
}
