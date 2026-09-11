import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/authz";
import { withBase } from "@/lib/basePath";

/**
 * Yaroqsiz sessiyani TOZALAB login'ga yo'naltiradi.
 *
 * ⚠️ Alohida route, chunki cookie'ni faqat route handler yoki server action o'chira
 * oladi; middleware esa bazaga kira olmaydi (parol almashgan foydalanuvchining
 * JWT'sini yaroqli deb o'tkazib yuboradi).
 * ⚠️ AVVAL TEKSHIRILADI: sessiya yaroqli bo'lsa CHIQARILMAYDI — aks holda begona
 * sahifa `<img src=".../session-expired">` bilan istalgan foydalanuvchini chiqarib
 * yuborishi mumkin edi.
 */
export async function GET() {
  if (await getCurrentUser()) redirect("/dashboard");
  await signOut({ redirectTo: withBase("/login?expired=1") });
}
