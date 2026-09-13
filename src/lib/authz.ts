import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PaymentFilters } from "@/server/services/payments";

export type SessionUser = {
  id: string;
  role: Role;
  username: string;
  name: string;
  /** Faqat MODERATOR uchun — biriktirilgan hudud (`lists.type_id = 1` id). */
  regionId: number | null;
};

// Rol (va moderator hududi) JWT'dan EMAS, har so'rovda bazadan o'qiladi — o'zgarsa yoki
// foydalanuvchi bloklansa, u qayta kirishini kutmasdan kuchga kiradi. `cache()` — bir so'rovda bitta.
const loadUser = cache(async (id: string) =>
  prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, username: true, fullName: true, isActive: true, sessionVersion: true, regionId: true },
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

  return { id: db.id, role: db.role, username: db.username, name: db.fullName, regionId: db.regionId };
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

// ── Hudud moderatori (foydalanuvchi qarori, 2026-09-14) ──────────────────────
//
// FAQAT "To'lovlar ro'yxati" (va uning Excel'i), FAQAT o'z hududi.
// ⚠️ Menyuda yashirish — faqat ko'rinish. Haqiqiy himoya: sahifalarda `requireAdminPage()`,
//    ro'yxat va eksportda `scopeFilters()`. Yangi sahifa/route qo'shsangiz — moderatorni o'ylang.

/** Moderatorning yagona bo'limi — boshqa sahifalar uni shu yerga yuboradi. */
export const MODERATOR_HOME = "/dashboard/royxat";

export const isModerator = (u: Pick<SessionUser, "role">): boolean => u.role === "MODERATOR";

/** Sahifa uchun: moderator ko'rmaydigan bo'lim (umumiy, kanallar) — uni ro'yxatga yuboradi. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUserOrRedirect();
  if (isModerator(user)) redirect(MODERATOR_HOME);
  return user;
}

/** Server action uchun: moderator emas. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (isModerator(user)) throw new Error("Ruxsat yo'q");
  return user;
}

/**
 * Filtrni foydalanuvchi doirasiga toraytiradi. Moderator uchun hudud MAJBURIY o'zining —
 * URL'dagi `hudud` e'tiborsiz (qo'lda o'zgartirib boshqa hududni ochib bo'lmaydi).
 * ⚠️ Ro'yxat sahifasi VA Excel eksporti — IKKALASI shu orqali; biri unutilsa cheklov teshiladi.
 * `null` — moderatorga hudud biriktirilmagan: hech narsa ko'rsatilmaydi.
 */
export function scopeFilters(user: SessionUser, f: PaymentFilters): PaymentFilters | null {
  if (!isModerator(user)) return f;
  if (user.regionId === null) return null;
  // Tuman faqat o'z hududi tanlangan bo'lsa saqlanadi (boshqa hudud tumani tashlanadi).
  return { ...f, obl: user.regionId, area: f.obl === user.regionId ? f.area : undefined };
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrator",
  MODERATOR: "Hudud moderatori",
};
