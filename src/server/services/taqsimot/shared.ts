import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { CHANNELS } from "@/lib/channels";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";

/**
 * TAQSIMOT (umumiy qismlar) — bitta to'lov hujjati (`paydocs`) pulining yo'li.
 *
 *   paydocs.id ─→ payment_items.pay_id   qismlar (hujjat shartnomalarga bo'lingan)
 *              ─→ 12 kanal ulushi        *_sum / *_accept / sent_*  (`lib/channels.ts`)
 *              ─→ uzasbo_send            g'aznachilikka topshiriqnoma: bitta oluvchi, bir davr,
 *                                        KO'P qism (`payment_items_id` — vergulli id matni)
 *
 * Jonli sxema (server, 2026-09-15): `paydocs` 827 262 ta — faol kirim `state = 1` (426 013 ta),
 * `state = 0` — chiqim/qaytarish (Расход/Возврат). `uzasbo_send` 309 640 ta.
 *
 * ⚠️ Bog'lanishlarda FK YO'Q — hammasi qiymat bo'yicha. `payment_items.doc_id` — boshqa narsa
 *    (`pay_id` bilan birorta ham mos emas); `pay_id` da indeks yo'q, hujjat qismlari ~0.1 s.
 * ⚠️ Faqat `state = 1` qismlar hisobga kiradi (ilova qoidasi); bekorlari ko'rsatiladi, lekin sanalmaydi.
 * ⚠️ `sent_*` = topshiriqnomaga KIRITILGAN, to'langan emas. To'langan — `PAID` (`lib/uzasbo.ts`).
 * ⚠️ `uzasbo_send.status` — Postgres ENUM: Prisma xom so'rovda uni o'qiy olmaydi, `::text` SHART.
 * ⚠️ `uzasbo_send` da ham audit triggeri bor — faqat `readOnly()`.
 */

// `ITEMS_ARR` (GIN indeks ifodasi) va `PAID` — `uzasboSql.ts` da (to'lovlar xizmati bilan umumiy).

/**
 * ⚠️ `payment_items_id` HAR DOIM "shu topshiriqnoma to'lagan qismlar" EMAS (server, 2026-09-15):
 * birlashtirilgan turlarda (QQS, mahalliy, markaz, PF-16, …) ro'yxat ko'pincha DAVR BOSHIDAN
 * TO'PLANADI — `date_from` qotib, `date_to` o'sadi, har yangi topshiriqnoma oldingi qismlarni ham
 * qayta sanaydi, summasi esa faqat yangilari uchun (bitta QQS qismi 531 ta to'langan topshiriqnomada).
 * Shuning uchun (qism, kanal) ning ASOSIY topshiriqnomasi — uni o'z ichiga olgan BIRINCHI to'langani;
 * qolganlari "takroriy ro'yxat", summaga kirmaydi.
 * Faqat balansda saqlovchi (rt 4) da har topshiriqnomada BITTA qism (summasi 30/30 mos) — ikki marta
 * to'lashni ro'yxatdan faqat SHU tur uchun aniqlash mumkin.
 */
export const SINGLE_ITEM_RT = 4;

/** 12 kanal ustunlari — nomlar FAQAT `CHANNELS` dan (whitelist). */
export const ITEM_SHARES = Prisma.raw(
  CHANNELS.map((c) => `pi.${c.sum} AS "${c.key}_s", pi.${c.accept} AS "${c.key}_a", pi.${c.sent} AS "${c.key}_t"`).join(", "),
);

export const cacheOpts = () => ({ revalidate: env.CACHE_SECONDS, tags: [PAYMENTS_CACHE_TAG] });
export const whereSql = (conds: Prisma.Sql[]) => Prisma.join(conds, " AND ");
export const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
export const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
