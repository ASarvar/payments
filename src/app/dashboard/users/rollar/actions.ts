"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadRoleAccess, requireSuperAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { EDITABLE_ROLES, PAGE_KEYS } from "@/lib/pages";

export async function saveRoleAccessAction(fd: FormData): Promise<void> {
  const actor = await requireSuperAdmin();

  const before = Object.fromEntries(
    await Promise.all(EDITABLE_ROLES.map(async (r) => [r, [...(await loadRoleAccess(r))]] as const)),
  );
  const rows = EDITABLE_ROLES.flatMap((role) =>
    PAGE_KEYS.map((page) => ({ role, page, allowed: fd.get(`${role}:${page}`) === "on" })),
  );
  const after = Object.fromEntries(EDITABLE_ROLES.map((r) => [r, rows.filter((x) => x.role === r && x.allowed).map((x) => x.page)]));

  await prisma.$transaction([
    prisma.rolePageAccess.deleteMany({ where: { role: { in: [...EDITABLE_ROLES] } } }),
    prisma.rolePageAccess.createMany({ data: rows }),
  ]);
  await audit(actor.id, "UPDATE_ROLE_ACCESS", { oldin: before, keyin: after });

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/users/rollar?saqlandi=1");
}
