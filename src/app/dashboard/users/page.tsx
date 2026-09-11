import { requireSuperAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Card, th } from "@/components/ui";
import { CreateUserForm, UserRow, type UserView } from "./UsersClient";

export default async function UsersPage() {
  const me = await requireSuperAdminPage();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { username: "asc" }],
    select: { id: true, username: true, fullName: true, role: true, isActive: true, lastLoginAt: true },
  });

  // ⚠️ Sana SERVERDA formatlanadi — client komponent gidratsiyasi buzilmasin.
  const views: UserView[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
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
        Ilova faqat administratorlar uchun. Super admin qo&apos;shimcha ravishda foydalanuvchilar va auditni boshqaradi.
        Parol tiklansa yoki foydalanuvchi bloklansa, uning sessiyalari darhol bekor bo&apos;ladi.
      </p>

      <Card title="Yangi foydalanuvchi">
        <CreateUserForm />
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
                <UserRow key={u.id} u={u} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
