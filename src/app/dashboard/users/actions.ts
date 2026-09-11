"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";

export type ActionState = { ok?: string; error?: string } | null;

const PASSWORD = z.string().min(10, "Parol kamida 10 belgi bo'lishi kerak").max(200);
const ROLE = z.enum(["ADMIN", "SUPER_ADMIN"]);

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Login: 3–40 belgi, lotin harflari, raqam, . _ -"),
  fullName: z.string().trim().min(3, "F.I.Sh. kamida 3 belgi").max(120),
  password: PASSWORD,
  role: ROLE,
});

function fail(e: unknown): ActionState {
  return { error: e instanceof Error ? e.message : "Kutilmagan xato" };
}

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await requireSuperAdmin();
    const p = createSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) return { error: p.error.issues[0]?.message ?? "Ma'lumot noto'g'ri" };

    if (await prisma.user.findUnique({ where: { username: p.data.username } })) {
      return { error: "Bu login allaqachon band" };
    }
    const u = await prisma.user.create({
      data: {
        username: p.data.username,
        fullName: p.data.fullName,
        passwordHash: await bcrypt.hash(p.data.password, 10),
        role: p.data.role,
      },
    });
    await audit(actor.id, "CREATE_USER", { username: u.username, role: u.role });
    revalidatePath("/dashboard/users");
    return { ok: `"${u.username}" qo'shildi` };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await requireSuperAdmin();
    const userId = String(fd.get("userId") ?? "");
    const p = PASSWORD.safeParse(fd.get("password"));
    if (!p.success) return { error: p.error.issues[0]?.message };

    const u = await prisma.user.update({
      where: { id: userId },
      // ⚠️ `sessionVersion` oshadi — o'sha foydalanuvchining BARCHA faol sessiyalari bekor.
      data: { passwordHash: await bcrypt.hash(p.data, 10), sessionVersion: { increment: 1 } },
    });
    await audit(actor.id, "RESET_PASSWORD", { username: u.username });
    revalidatePath("/dashboard/users");
    return { ok: "Parol yangilandi, eski sessiyalar bekor qilindi" };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await requireSuperAdmin();
    const userId = String(fd.get("userId") ?? "");
    const role = ROLE.parse(fd.get("role"));
    const isActive = fd.get("isActive") === "on";

    // O'zini bloklab qo'yishning oldini olish.
    if (userId === actor.id && (role !== "SUPER_ADMIN" || !isActive)) {
      return { error: "O'z rolingizni pasaytira yoki o'zingizni bloklay olmaysiz" };
    }
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, username: true } });
    if (!target) return { error: "Foydalanuvchi topilmadi" };
    if (target.role === "SUPER_ADMIN" && (role !== "SUPER_ADMIN" || !isActive)) {
      const active = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
      if (active <= 1) return { error: "Tizimda kamida bitta faol super admin qolishi kerak" };
    }

    await prisma.user.update({ where: { id: userId }, data: { role, isActive } });
    await audit(actor.id, "UPDATE_USER", { username: target.username, role, isActive });
    revalidatePath("/dashboard/users");
    return { ok: "Saqlandi" };
  } catch (e) {
    return fail(e);
  }
}
