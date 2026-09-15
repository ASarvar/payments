import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";
import { readOnly } from "@/lib/projectDb";
import { PAYMENTS_CACHE_TAG, getRegions } from "@/server/services/payments";
import { toNum, type Row } from "@/server/services/sqlUtil";

/**
 * "SHARTNOMALAR BO'YICHA" — yil bo'yicha hisoblangan ijara/penya, to'langan va qarzdorlik, hududlar
 * kesimida. Mavjud tizim (online-ijara.uz) hisobotining AYNAN o'sha ta'rifi (foydalanuvchi SQL'i,
 * 2026-09-15). Bu bo'limning BARCHA SQL'i shu yerda.
 *
 *   shartnomalar = vw_contracts (state = 1, doc_status = 3, doc_year = yil, type IN (1, 2)): soni, asum
 *   qarzdorlik   = o'sha shartnomalar: debitor = |saldo| (saldo < 0), ijara/penya — |rent|, |penya|
 *                  (har biri o'z manfiyligi bo'yicha); kreditor = saldo (saldo > 0)
 *   hisoblandi   = billing (state = 1, ayear = yil): ijara = credit_sum, penya = penya, jami = ikkalasi
 *   to'landi     = payment_items (state = 1, ayear = yil, pay_type 1 = ijara, 2 = penya);
 *                  "bir kunda" — BUGUN (asl so'rovdagidek, yil tanlovidan qat'i nazar)
 *
 * ⚠️ `vw_contracts` — `vw_all_contracts` EMAS, boshqa ko'rinish.
 * ⚠️ `vw_contracts.doc_year` va `billing.ayear` tipi tasdiqlanmagan — MATN sifatida solishtiriladi
 *    (int ham, varchar ham ishlaydi). `payment_items.ayear` — integer (\d bilan tasdiqlangan).
 * ⚠️ Asl kabi faqat `lists` hududlari (id > 0).
 */

/** Yil tanlovidagi eng birinchi yil (to'lov ma'lumoti 2023-08 dan). */
export const FIRST_YEAR = 2023;

export interface ShTriple {
  jami: number;
  rent: number;
  penya: number;
}

export interface ShRow {
  id: number | null;
  name: string;
  /** Shartnomalar soni va summasi. */
  count: number;
  sum: number;
  hisob: ShTriple;
  /** To'langan — bugun. */
  day: ShTriple;
  /** To'langan — yil davomida. */
  paid: ShTriple;
  debitor: ShTriple;
  creditor: number;
}

const zero3 = (): ShTriple => ({ jami: 0, rent: 0, penya: 0 });

async function computeShartnomalar(year: number, today: string): Promise<ShRow[]> {
  const y = String(year);
  const [rows, regions] = await Promise.all([
    readOnly((tx) =>
      tx.$queryRaw<Row[]>(Prisma.sql`
        WITH c AS (
          SELECT obl_id, count(id) AS cc_count, sum(asum) AS cc_sum,
                 sum(abs(saldo)) FILTER (WHERE saldo < 0) AS debitor,
                 sum(abs(rent)) FILTER (WHERE rent < 0) AS debitor_rent,
                 sum(abs(penya)) FILTER (WHERE penya < 0) AS debitor_penya,
                 sum(saldo) FILTER (WHERE saldo > 0) AS creditor
          FROM vw_contracts
          WHERE state = 1 AND doc_status = 3 AND doc_year::text = ${y} AND type IN (1, 2)
          GROUP BY obl_id
        ), b AS (
          SELECT obl_id, sum(credit_sum) AS credit_sum, sum(penya) AS penya
          FROM billing WHERE state = 1 AND ayear::text = ${y}
          GROUP BY obl_id
        ), p AS (
          SELECT obl_id,
                 sum(asum) FILTER (WHERE doc_date = ${today}::date) AS day_pay,
                 sum(asum) FILTER (WHERE pay_type = 1 AND doc_date = ${today}::date) AS day_rent,
                 sum(asum) FILTER (WHERE pay_type = 2 AND doc_date = ${today}::date) AS day_penya,
                 sum(asum) AS pay,
                 sum(asum) FILTER (WHERE pay_type = 1) AS pay_rent,
                 sum(asum) FILTER (WHERE pay_type = 2) AS pay_penya
          FROM payment_items
          WHERE state = 1 AND ayear = ${year}::int AND pay_type IN (1, 2)
          GROUP BY obl_id
        ), k AS (SELECT obl_id FROM c UNION SELECT obl_id FROM b UNION SELECT obl_id FROM p)
        SELECT k.obl_id, c.cc_count, c.cc_sum, c.debitor, c.debitor_rent, c.debitor_penya, c.creditor,
               b.credit_sum, b.penya, p.day_pay, p.day_rent, p.day_penya, p.pay, p.pay_rent, p.pay_penya
        FROM k LEFT JOIN c USING (obl_id) LEFT JOIN b USING (obl_id) LEFT JOIN p USING (obl_id)`),
    ),
    getRegions(),
  ]);
  const byObl = new Map(rows.map((r) => [Number(r.obl_id), r]));
  return regions
    .filter((reg) => reg.id > 0)
    .map((reg) => {
      const r = byObl.get(reg.id) ?? {};
      const rent = toNum(r.credit_sum);
      const penya = toNum(r.penya);
      return {
        id: reg.id,
        name: reg.name,
        count: toNum(r.cc_count),
        sum: toNum(r.cc_sum),
        hisob: { jami: rent + penya, rent, penya },
        day: { jami: toNum(r.day_pay), rent: toNum(r.day_rent), penya: toNum(r.day_penya) },
        paid: { jami: toNum(r.pay), rent: toNum(r.pay_rent), penya: toNum(r.pay_penya) },
        debitor: { jami: toNum(r.debitor), rent: toNum(r.debitor_rent), penya: toNum(r.debitor_penya) },
        creditor: toNum(r.creditor),
      };
    });
}

export const getShartnomalar = (year: number, today: string) =>
  unstable_cache(computeShartnomalar, ["sh-v1"], { revalidate: env.CACHE_SECONDS, tags: [PAYMENTS_CACHE_TAG] })(year, today);

/** JAMI qatori. */
export function totalSh(rows: ShRow[]): ShRow {
  const add = (a: ShTriple, b: ShTriple): ShTriple => ({ jami: a.jami + b.jami, rent: a.rent + b.rent, penya: a.penya + b.penya });
  const t: ShRow = { id: null, name: "J A M I", count: 0, sum: 0, hisob: zero3(), day: zero3(), paid: zero3(), debitor: zero3(), creditor: 0 };
  for (const r of rows) {
    t.count += r.count;
    t.sum += r.sum;
    t.hisob = add(t.hisob, r.hisob);
    t.day = add(t.day, r.day);
    t.paid = add(t.paid, r.paid);
    t.debitor = add(t.debitor, r.debitor);
    t.creditor += r.creditor;
  }
  return t;
}
