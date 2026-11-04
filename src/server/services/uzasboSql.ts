import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { PAID_UZASBO_STATUS } from "@/lib/uzasbo";

export const PAID_CACHE_SECONDS = Math.max(env.CACHE_SECONDS, 1800);

export const ITEMS_ARR = Prisma.raw(String.raw`string_to_array(regexp_replace(u.payment_items_id, '\s+', '', 'g'), ',')`);

export const ITEMS_PARSED = Prisma.raw(String.raw`string_to_array(translate(u.payment_items_id, E' \t\n\r\f', ''), ',')`);

export const PAID = Prisma.raw(`u.state = 1 AND u.status = 'SENT' AND u.uzasbo_status = ${PAID_UZASBO_STATUS}`);

export function paidCte(rts?: readonly number[]): Prisma.Sql {
  const only = rts && rts.length > 0 ? Prisma.sql`AND u.receiver_type = ANY(${[...rts]}::int[])` : Prisma.empty;
  return Prisma.sql`paid AS (
    SELECT e::bigint AS item, bit_or(1 << u.receiver_type) AS mask
    FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_PARSED}) AS e
    WHERE ${PAID} AND u.receiver_type BETWEEN 1 AND 30 AND e ~ '^[0-9]{1,18}$' ${only}
    GROUP BY 1)`;
}

export const PAID_JOIN = Prisma.sql`LEFT JOIN paid pd ON pd.item = pi.id`;

export function paidBit(rt: number): Prisma.Sql {
  if (!Number.isInteger(rt) || rt < 1 || rt > 30) throw new Error(`Noto'g'ri topshiriqnoma turi: ${rt}`);
  return Prisma.raw(`(COALESCE(pd.mask, 0) & ${1 << rt}) <> 0`);
}
