import { Prisma } from "@prisma/client";
import { PAID_UZASBO_STATUS } from "@/lib/uzasbo";

/**
 * `uzasbo_send` (g'aznachilikka topshiriqnomalar) bo'yicha SQL bo'laklari — to'lovlar va taqsimot
 * xizmatlari uchun UMUMIY. Barchasi `u` taxallusiga (`uzasbo_send u`) tayanadi.
 */

/**
 * Topshiriqnomadagi qism id'lari massivi. ⚠️ Serverdagi `idx_uzasbo_send_items_gin` ifodasi bilan
 * AYNAN bir xil — boshqacha yozilsa indeks ishlamaydi va har so'rov 300 ming qatorni skanlaydi.
 * ⚠️ `String.raw` — oddiy shablonda `\s` jimgina `s` ga aylanardi.
 */
export const ITEMS_ARR = Prisma.raw(String.raw`string_to_array(regexp_replace(u.payment_items_id, '\s+', '', 'g'), ',')`);

/**
 * Ro'yxatni YOYISH uchun (indekssiz): `ITEMS_ARR` bilan bir xil natija, lekin `translate` —
 * serverda (2026-09-15) barcha to'langan ro'yxatlarda `regexp_replace` 3,9 s olardi (6,45 mln id).
 * ⚠️ GIN qidiruvida (`&&`, `@>`) FAQAT `ITEMS_ARR` — indeks o'sha ifoda bo'yicha.
 */
export const ITEMS_PARSED = Prisma.raw(String.raw`string_to_array(translate(u.payment_items_id, E' \t\n\r\f', ''), ',')`);

/** G'aznachilik ijro etgan (pul to'langan) topshiriqnoma. */
export const PAID = Prisma.raw(`u.state = 1 AND u.status = 'SENT' AND u.uzasbo_status = ${PAID_UZASBO_STATUS}`);

/**
 * `paid` CTE: qism id → g'aznachilik TO'LAGAN kanallar bit-maskasi (`1 << receiver_type`). Ulush
 * to'langan = qism shu kanalning kamida bitta to'langan topshiriqnomasi ro'yxatida bor (Taqsimot
 * sahifasidagi "asosiy topshiriqnoma" bilan bir xil ta'rif).
 *
 * ⚠️ OG'IR: to'langan topshiriqnomalarning BARCHA ro'yxatlari yoyiladi (birlashtirilgan turlarda
 * ro'yxat davr boshidan to'planadi — bitta QQS qismi yuzlab marta uchraydi). Shuning uchun natijalar
 * keshlanadi va bitta kanal kerak bo'lsa `rts` bilan toraytiriladi. Filtrdagi qismlar bo'yicha
 * toraytirib bo'lmaydi — ro'yxat qaysi qismlarni o'z ichiga olgani oldindan noma'lum.
 * Serverda (2026-09-15): barcha turlar + QQS skani — 7,6 s. Faqat keshlangan hisobotlarda.
 * Ulanish: `LEFT JOIN paid pd ON pd.item = pi.id` (`PAID_JOIN`), shart — `paidBit(rt)`.
 */
export function paidCte(rts?: readonly number[]): Prisma.Sql {
  const only = rts && rts.length > 0 ? Prisma.sql`AND u.receiver_type = ANY(${[...rts]}::int[])` : Prisma.empty;
  return Prisma.sql`paid AS (
    SELECT e::bigint AS item, bit_or(1 << u.receiver_type) AS mask
    FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_PARSED}) AS e
    WHERE ${PAID} AND u.receiver_type BETWEEN 1 AND 30 AND e ~ '^[0-9]{1,18}$' ${only}
    GROUP BY 1)`;
}

/**
 * Xuddi shu shakldagi `paid` CTE, lekin tayyor to'plamdan (`paidItems.ts`, bitta kanal) — ro'yxat
 * so'rovlarida yoyishni qaytarmaslik uchun. `paidBit(rt)` va `PAID_JOIN` o'zgarishsiz ishlaydi.
 */
export function paidListCte(ids: string[], rt: number): Prisma.Sql {
  return Prisma.sql`paid AS (SELECT unnest(${ids}::bigint[]) AS item, ${1 << rt}::int AS mask)`;
}

export const PAID_JOIN = Prisma.sql`LEFT JOIN paid pd ON pd.item = pi.id`;

/** `paid` ulangan so'rovda: shu kanal (`rt`) ulushi to'langan. `rt` — faqat `CHANNELS` dan. */
export function paidBit(rt: number): Prisma.Sql {
  if (!Number.isInteger(rt) || rt < 1 || rt > 30) throw new Error(`Noto'g'ri topshiriqnoma turi: ${rt}`);
  return Prisma.raw(`(COALESCE(pd.mask, 0) & ${1 << rt}) <> 0`);
}
