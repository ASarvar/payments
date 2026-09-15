import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";
import { readOnly } from "@/lib/projectDb";
import { shiftDate } from "@/lib/format";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";
import { isoDate, toNum, type Row } from "@/server/services/sqlUtil";
import { PAID } from "@/server/services/uzasboSql";

/**
 * NAZORAT PANELI — kunlik dinamika (oxirgi `DYNAMICS_DAYS` kun). Uch oqim, har biri O'Z sanasi bilan:
 *   tushum        = paydocs.asum             (state = 1, `doc_date` — "Biriktirish borishi" bilan bir xil)
 *   biriktirilgan = payments.parsing_sum (`doc_date`) + MUNIS real_sum (status > NEW, `created_at` kuni)
 *   to'langan     = uzasbo_send.receiver_sum (g'aznachilik to'lagan, `uzasbo_treas_oper_date` kuni)
 * ⚠️ To'langan — PUL OQIMI (shu kuni g'aznachilik to'lagani), kogorta emas: pul yo'lidagi "to'landi"
 * bosqichi (to'lov sanasi bo'yicha qismlar) bilan to'g'ridan-to'g'ri solishtirilmaydi.
 * ⚠️ Tushum/biriktirilgan — "Biriktirish borishi" kabi faqat `lists` hududlari (obl_id > 0);
 * to'langan — hudud tanlanmasa BARCHA topshiriqnomalar (respublika darajasidagilari ham).
 */

export const DYNAMICS_DAYS = 30;

export interface DayPoint {
  d: string;
  tushum: number;
  biriktirilgan: number;
  tolangan: number;
}

async function computeDynamics(to: string, obl?: number): Promise<DayPoint[]> {
  const from = shiftDate(to, -(DYNAMICS_DAYS - 1));
  const region = (c: string) =>
    obl !== undefined ? Prisma.sql`AND ${Prisma.raw(c)} = ${obl}::int` : Prisma.sql`AND ${Prisma.raw(c)} > 0`;
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      WITH t AS (
        SELECT doc_date AS d, sum(asum) AS v FROM paydocs
        WHERE state = 1 AND doc_date BETWEEN ${from}::date AND ${to}::date ${region("obl_id")}
        GROUP BY 1
      ), p AS (
        SELECT doc_date AS d, sum(parsing_sum) AS v FROM payments
        WHERE state = 1 AND doc_date BETWEEN ${from}::date AND ${to}::date ${region("obl_id")}
        GROUP BY 1
      ), m AS (
        SELECT created_at::date AS d, sum(real_sum) AS v FROM munis_receive_payment
        WHERE state = 1 AND status > 'NEW'::munis_receive_payment_status
          AND created_at >= ${from}::date AND created_at < ${to}::date + 1 ${region("obl_id")}
        GROUP BY 1
      ), u AS (
        SELECT u.uzasbo_treas_oper_date AS d, sum(u.receiver_sum) AS v FROM uzasbo_send u
        WHERE ${PAID} AND u.uzasbo_treas_oper_date BETWEEN ${from}::date AND ${to}::date
          ${obl !== undefined ? Prisma.sql`AND u.obl_id = ${obl}::int` : Prisma.empty}
        GROUP BY 1
      )
      SELECT g.d::date AS d, t.v AS tushum, p.v AS parsing, m.v AS munis, u.v AS paid
      FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS g(d)
      LEFT JOIN t ON t.d = g.d::date
      LEFT JOIN p ON p.d = g.d::date
      LEFT JOIN m ON m.d = g.d::date
      LEFT JOIN u ON u.d = g.d::date
      ORDER BY 1`),
  );
  return rows.map((r) => ({
    d: isoDate(r.d) ?? "",
    tushum: toNum(r.tushum),
    biriktirilgan: toNum(r.parsing) + toNum(r.munis),
    tolangan: toNum(r.paid),
  }));
}

export const getDynamics = (to: string, obl?: number) =>
  unstable_cache(computeDynamics, ["naz-dyn-v1"], { revalidate: env.CACHE_SECONDS, tags: [PAYMENTS_CACHE_TAG] })(to, obl);
