import { requireUserOrRedirect, ROLE_LABEL } from "@/lib/authz";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // ⚠️ Redirect qiladi (xato emas) — eskirgan sessiya login'ga tushsin.
  const user = await requireUserOrRedirect();

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={{ name: user.name, username: user.username, roleLabel: ROLE_LABEL[user.role] }}
        isSuperAdmin={user.role === "SUPER_ADMIN"}
      />
      <div className="md:pl-64">
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
