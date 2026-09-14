"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { ROLE_ORDER } from "@/lib/roles";
import { getRegions } from "@/server/services/payments";

/** Yangi foydalanuvchi formasiga xato bilan qaytariladigan qiymatlar (PAROLSIZ). */
export type CreateValues = { username: string; fullName: string; role: Role; regionId: number | null };
export type ActionState = { ok?: string; error?: string; values?: CreateValues } | null;

const PASSWORD = z.string().min(10, "Parol kamida 10 belgi bo'lishi kerak").max(200);
const ROLE = z.enum(ROLE_ORDER);

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

/** Formadagi hudud id — butun son bo'lmasa `null`. */
function regionOf(raw: FormDataEntryValue | null): number | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^\d{1,9}$/.test(s) ? Number(s) : null;
}

/**
 * Moderator hududi: faqat MODERATOR uchun va MAJBURIY; boshqa rollarda `null`.
 * ⚠️ FK yo'q (hududlar `project` bazasida) — YANGI id o'sha yerdagi haqiqiy ro'yxatdan
 * tekshiriladi. O'zgarmagan hudud (`current`) tekshirilmaydi: `project` ishlamay qolganda
 * ham moderatorni bloklash yoki boshqa maydonini saqlash mumkin bo'lsin.
 */
async function resolveRegion(
  role: Role,
  raw: FormDataEntryValue | null,
  current: number | null = null,
): Promise<{ regionId: number | null } | { error: string }> {
  if (role !== "MODERATOR") return { regionId: null };
  const id = regionOf(raw);
  if (id === null) return { error: "Moderator uchun hududni tanlang" };
  if (id === current) return { regionId: id };
  let regions;
  try {
    regions = await getRegions();
  } catch {
    return { error: "Hududlar ro'yxatini to'lovlar bazasidan olib bo'lmadi" };
  }
  if (!regions.some((r) => r.id === id)) return { error: "Bunday hudud topilmadi" };
  return { regionId: id };
}

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  // ⚠️ React forma amalidan keyin maydonlarni tozalaydi — xato bo'lsa kiritilgani qaytariladi.
  const values: CreateValues = {
    username: String(fd.get("username") ?? ""),
    fullName: String(fd.get("fullName") ?? ""),
    role: ROLE.safeParse(fd.get("role")).data ?? "ADMIN",
    regionId: regionOf(fd.get("regionId")),
  };
  const err = (error: string): ActionState => ({ error, values });
  try {
    const actor = await requireSuperAdmin();
    const p = createSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) return err(p.error.issues[0]?.message ?? "Ma'lumot noto'g'ri");
    const region = await resolveRegion(p.data.role, fd.get("regionId"));
    if ("error" in region) return err(region.error);

    if (await prisma.user.findUnique({ where: { username: p.data.username } })) {
      return err("Bu login allaqachon band");
    }
    const u = await prisma.user.create({
      data: {
        username: p.data.username,
        fullName: p.data.fullName,
        passwordHash: await bcrypt.hash(p.data.password, 10),
        role: p.data.role,
        regionId: region.regionId,
      },
    });
    await audit(actor.id, "CREATE_USER", { username: u.username, role: u.role, regionId: u.regionId });
    revalidatePath("/dashboard/users");
    return { ok: `"${u.username}" qo'shildi` };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Kutilmagan xato");
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
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, username: true, regionId: true },
    });
    if (!target) return { error: "Foydalanuvchi topilmadi" };
    if (target.role === "SUPER_ADMIN" && (role !== "SUPER_ADMIN" || !isActive)) {
      const active = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
      if (active <= 1) return { error: "Tizimda kamida bitta faol super admin qolishi kerak" };
    }
    const region = await resolveRegion(role, fd.get("regionId"), target.regionId);
    if ("error" in region) return { error: region.error };

    // Rol va hudud har so'rovda bazadan o'qiladi (`getCurrentUser`) — sessiyani bekor qilish shart emas.
    await prisma.user.update({ where: { id: userId }, data: { role, isActive, regionId: region.regionId } });
    await audit(actor.id, "UPDATE_USER", { username: target.username, role, isActive, regionId: region.regionId });
    revalidatePath("/dashboard/users");
    return { ok: "Saqlandi" };
  } catch (e) {
    return fail(e);
  }
}
