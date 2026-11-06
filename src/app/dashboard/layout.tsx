import { getAllowedPages, isModerator, requireUserOrRedirect, ROLE_LABEL } from "@/lib/authz";
import { PAGE_KEYS } from "@/lib/pages";
import { Sidebar } from "@/components/Sidebar";
import { getRegions, type Option } from "@/server/services/payments";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  const allowed = await getAllowedPages(user);

  let roleLabel = ROLE_LABEL[user.role];
  if (isModerator(user) && user.regionId !== null) {
    const regions = await getRegions().catch((): Option[] => []);
    const name = regions.find((r) => r.id === user.regionId)?.name;
    if (name) roleLabel = `${roleLabel} · ${name}`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={{ name: user.name, username: user.username, roleLabel }}
        isSuperAdmin={user.role === "SUPER_ADMIN"}
        pages={PAGE_KEYS.filter((k) => allowed.has(k))}
      />
      <div className="md:pl-64">
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
