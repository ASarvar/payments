import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  role: Role;
  username: string;
  name: string;
};

// Rol JWT'dan EMAS, har so'rovda bazadan o'qiladi — rol o'zgarsa yoki foydalanuvchi
// bloklansa, u qayta kirishini kutmasdan kuchga kiradi. `cache()` — bir so'rovda bitta.
const loadUser = cache(async (id: string) =>
  prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, username: true, fullName: true, isActive: true, sessionVersion: true },
  }),
);

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const db = await loadUser(id);
  if (!db || !db.isActive) return null;
  // ⚠️ Parol almashtirilgan — token eski versiyada, sessiya yaroqsiz.
  if (session.user.sessionVersion !== db.sessionVersion) return null;

  return { id: db.id, role: db.role, username: db.username, name: db.fullName };
}

/** Yaroqsiz sessiyani tozalaydigan route (`app/session-expired/route.ts`). */
export const SESSION_EXPIRED_PATH = "/session-expired";

/**
 * SAHIFA qo'riqchisi: sessiya yo'q yoki eskirgan bo'lsa — login'ga (cookie tozalanib).
 * ⚠️ `requireUser()` dan farqi: u XATO tashlaydi (server action'lar uni try/catch
 * ichida chaqiradi — redirect u yerda yutilib ketardi).
 */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Avtorizatsiya talab qilinadi");
  return user;
}

/** Server action / route uchun: faqat SUPER_ADMIN. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") throw new Error("Ruxsat yo'q");
  return user;
}

/**
 * Sahifa uchun: faqat SUPER_ADMIN, aks holda "topilmadi".
 * ⚠️ `notFound()`, `throw` EMAS — production'da xato matni o'chiriladi va foydalanuvchi
 * tushunarsiz xato sahifasini ko'rardi (obyektlar ilovasidagi saboq).
 */
export async function requireSuperAdminPage(): Promise<SessionUser> {
  const user = await requireUserOrRedirect();
  if (user.role !== "SUPER_ADMIN") notFound();
  return user;
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrator",
};
