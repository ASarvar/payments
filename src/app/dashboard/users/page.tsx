import { requireSuperAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getRegions } from "@/server/services/payments";
import { Card, th } from "@/components/ui";
import { CreateUserForm, UserRow, type RegionOpt, type UserView } from "./UsersClient";

export default async function UsersPage() {
  const me = await requireSuperAdminPage();
  const [users, regionsOrNull] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { username: "asc" }],
      select: { id: true, username: true, fullName: true, role: true, regionId: true, isActive: true, lastLoginAt: true },
    }),
    // `project` bazasi ishlamasa ham sahifa ochilsin — faqat moderator qo'shib bo'lmaydi.
    getRegions().then(
      (r): RegionOpt[] | null => r,
      () => null,
    ),
  ]);
  const regions = regionsOrNull ?? [];

  // ⚠️ Sana SERVERDA formatlanadi — client komponent gidratsiyasi buzilmasin.
  const views: UserView[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    regionId: u.regionId,
    isActive: u.isActive,
    lastLogin: u.lastLoginAt
      ? u.lastLoginAt.toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" })
      : "—",
    isSelf: u.id === me.id,
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight" style={{ color: "var(--navy)" }}>
        Foydalanuvchilar
      </h1>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Administrator barcha hisobotlarni ko&apos;radi, super admin qo&apos;shimcha ravishda foydalanuvchilar va auditni
        boshqaradi. Hudud moderatori faqat &quot;To&apos;lovlar ro&apos;yxati&quot;ni va faqat o&apos;z hududini ko&apos;radi
        (Excel ham shu hudud bo&apos;yicha). Parol tiklansa yoki foydalanuvchi bloklansa, uning sessiyalari darhol bekor
        bo&apos;ladi.
      </p>
      {regionsOrNull === null ? (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Hududlar ro&apos;yxatini to&apos;lovlar bazasidan olib bo&apos;lmadi — hozircha moderator qo&apos;shib yoki
          hududini o&apos;zgartirib bo&apos;lmaydi.
        </p>
      ) : null}

      <Card title="Yangi foydalanuvchi">
        <CreateUserForm regions={regions} />
      </Card>

      <Card title={`Ro'yxat — ${users.length} ta`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={th}>Login</th>
                <th className={th}>Rol va holat</th>
                <th className={th}>Oxirgi kirish</th>
                <th className={th}>Parolni tiklash</th>
              </tr>
            </thead>
            <tbody>
              {views.map((u) => (
                <UserRow key={u.id} u={u} regions={regions} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
