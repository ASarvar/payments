import { requireSuperAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { AUDIT_LABEL } from "@/lib/audit";
import { Card, th, td } from "@/components/ui";

const LIMIT = 300;

export default async function AuditPage() {
  await requireSuperAdminPage();
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    include: { user: { select: { username: true } } },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight" style={{ color: "var(--navy)" }}>
        Audit
      </h1>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Oxirgi {LIMIT} ta amal: kirishlar, Excel eksportlari (hisob raqamlari bor), foydalanuvchi o&apos;zgarishlari.
      </p>
      <Card title="Jurnal">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={th}>Vaqt</th>
                <th className={th}>Foydalanuvchi</th>
                <th className={th}>Amal</th>
                <th className={th}>Tafsilot</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const details = l.details ? JSON.stringify(l.details) : "";
                return (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {l.createdAt.toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "medium" })}
                    </td>
                    <td className={td}>{l.user?.username ?? "—"}</td>
                    <td className={`${td} ${l.action.startsWith("LOGIN_") ? "text-red-700" : ""}`}>
                      {AUDIT_LABEL[l.action] ?? l.action}
                    </td>
                    <td className={`${td} max-w-[520px] break-all font-mono text-[11.5px] text-slate-500`}>
                      {details.length > 240 ? `${details.slice(0, 240)}…` : details}
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Hali yozuv yo&apos;q.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
