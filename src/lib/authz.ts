import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PaymentFilters } from "@/server/services/payments";

export { ROLE_LABEL } from "@/lib/roles";

export type SessionUser = {
  id: string;
  role: Role;
  username: string;
  name: string;
  /** Faqat MODERATOR (hudud moderatori) uchun — biriktirilgan hudud (`lists.type_id = 1` id). */
  regionId: number | null;
};

// ── Moderatorlar (foydalanuvchi qarorlari, 2026-09-14 va 2026-09-15) ─────────
//
// Ikkala tur ham FAQAT "To'lovlar ro'yxati" (va uning Excel'i)ni ko'radi:
//   MODERATOR          — hudud moderatori: FAQAT o'z hududi (`regionId`);
//   REPUBLIC_MODERATOR — respublika moderatori: barcha hududlar (hudud tanlay oladi).
// ⚠️ Menyuda yashirish — faqat ko'rinish. Haqiqiy himoya: `requireUserOrRedirect()`
//    moderatorlarni STANDART bo'yicha ro'yxatga yuboradi, ro'yxat va eksportda `scopeFilters()`.
//    Yangi API route qo'shsangiz — moderatorlarni o'ylang (`getCurrentUser()` ularni o'tkazadi).

/** Moderatorlarning yagona bo'limi — boshqa sahifalar ularni shu yerga yuboradi. */
export const MODERATOR_HOME = "/dashboard/royxat";

/** Har ikki moderator turi — faqat ro'yxat (sahifalar, menyu, "Yangilash" shunga qaraydi). */
export const isModerator = (u: Pick<SessionUser, "role">): boolean =>
  u.role === "MODERATOR" || u.role === "REPUBLIC_MODERATOR";

/** Faqat hudud moderatori — ma'lumot O'Z hududiga toraytiriladi (`scopeFilters`). */
export const isRegionModerator = (u: Pick<SessionUser, "role">): boolean => u.role === "MODERATOR";

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
 * ⚠️ Moderatorlar (ikkala tur) STANDART bo'yicha KIRITILMAYDI — ro'yxatga yuboriladi. Yangi
 * sahifa o'z-o'zidan ularga yopiq; ochiq joylar `{ moderator: true }` bilan aniq aytadi
 * (layout, ro'yxat). ⚠️ Dashboard layout'ida `moderator: true` SHART — aks holda ro'yxat ham
 * layout orqali o'ziga yo'naltirilib, cheksiz redirect bo'lardi.
 * ⚠️ `requireUser()` dan farqi: u XATO tashlaydi (server action'lar uni try/catch
 * ichida chaqiradi — redirect u yerda yutilib ketardi).
 */
export async function requireUserOrRedirect(opts: { moderator?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);
  if (isModerator(user) && !opts.moderator) redirect(MODERATOR_HOME);
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
 * Sahifa uchun: faqat SUPER_ADMIN, aks holda "topilmadi" (moderatorlarga ham).
 * ⚠️ `notFound()`, `throw` EMAS — production'da xato matni o'chiriladi va foydalanuvchi
 * tushunarsiz xato sahifasini ko'rardi (obyektlar ilovasidagi saboq).
 */
export async function requireSuperAdminPage(): Promise<SessionUser> {
  const user = await requireUserOrRedirect({ moderator: true });
  if (user.role !== "SUPER_ADMIN") notFound();
  return user;
}

/** Server action uchun: moderator emas (ikkala tur ham). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (isModerator(user)) throw new Error("Ruxsat yo'q");
  return user;
}

/**
 * Filtrni foydalanuvchi doirasiga toraytiradi. Hudud moderatori uchun hudud MAJBURIY
 * o'zining — URL'dagi `hudud` e'tiborsiz (qo'lda o'zgartirib boshqa hududni ochib bo'lmaydi).
 * Respublika moderatori va adminlar — o'zgarishsiz (barcha hududlar).
 * ⚠️ Ro'yxat sahifasi VA Excel eksporti — IKKALASI shu orqali; biri unutilsa cheklov teshiladi.
 * `null` — hudud moderatoriga hudud biriktirilmagan: hech narsa ko'rsatilmaydi.
 */
export function scopeFilters(user: SessionUser, f: PaymentFilters): PaymentFilters | null {
  if (!isRegionModerator(user)) return f;
  if (user.regionId === null) return null;
  // Tuman faqat o'z hududi tanlangan bo'lsa saqlanadi (boshqa hudud tumani tashlanadi).
  return { ...f, obl: user.regionId, area: f.obl === user.regionId ? f.area : undefined };
}
