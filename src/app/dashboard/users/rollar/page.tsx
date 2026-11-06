import { loadRoleAccess, requireSuperAdminPage, ROLE_LABEL } from "@/lib/authz";
import { one, type SP } from "@/lib/filters";
import { EDITABLE_ROLES, PAGES } from "@/lib/pages";
import { Card, th, td } from "@/components/ui";
import { UsersTabs } from "../Tabs";
import { saveRoleAccessAction } from "./actions";

export default async function RollarPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSuperAdminPage();
  const saqlandi = one((await searchParams).saqlandi) === "1";
  const access = await Promise.all(EDITABLE_ROLES.map(async (r) => [r, await loadRoleAccess(r)] as const));

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold tracking-tight" style={{ color: "var(--navy)" }}>
        Foydalanuvchilar
      </h1>
      <UsersTabs active="rollar" />

      <Card title="Sahifalarga kirish">
        <form action={saveRoleAccessAction}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={th}>Sahifa</th>
                  {access.map(([r]) => (
                    <th key={r} className={`${th} text-center`}>
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAGES.map((p) => (
                  <tr key={p.key} className="border-b border-border last:border-0">
                    <td className={td}>{p.label}</td>
                    {access.map(([r, set]) => (
                      <td key={r} className={`${td} text-center`}>
                        <input
                          type="checkbox"
                          name={`${r}:${p.key}`}
                          defaultChecked={set.has(p.key)}
                          aria-label={`${ROLE_LABEL[r]}: ${p.label}`}
                          className="h-4 w-4 accent-[var(--cobalt)]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 border-t border-border px-3 py-3">
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
              style={{ background: "var(--cobalt)" }}
            >
              Saqlash
            </button>
            {saqlandi ? <span className="text-[12px] text-emerald-700">Saqlandi</span> : null}
          </div>
        </form>
      </Card>
    </div>
  );
}
