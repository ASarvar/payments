import { isModerator, requireUserOrRedirect, ROLE_LABEL } from "@/lib/authz";
import { Sidebar } from "@/components/Sidebar";
import { getRegions, type Option } from "@/server/services/payments";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // ⚠️ Redirect qiladi (xato emas) — eskirgan sessiya login'ga tushsin.
  const user = await requireUserOrRedirect();
  const moderator = isModerator(user);

  // Moderatorga rol yonida hududi. `project` bazasi ishlamasa — faqat rol (menyu buzilmasin).
  let roleLabel = ROLE_LABEL[user.role];
  if (moderator && user.regionId !== null) {
    const regions = await getRegions().catch((): Option[] => []);
    const name = regions.find((r) => r.id === user.regionId)?.name;
    if (name) roleLabel = `${roleLabel} · ${name}`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={{ name: user.name, username: user.username, roleLabel }}
        isSuperAdmin={user.role === "SUPER_ADMIN"}
        isModerator={moderator}
      />
      <div className="md:pl-64">
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
