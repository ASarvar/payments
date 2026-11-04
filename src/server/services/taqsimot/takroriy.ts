import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { readOnly } from "@/lib/projectDb";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";
import { isoDate, str, toNum, type Row } from "@/server/services/sqlUtil";
import { ITEMS_ARR, PAID } from "@/server/services/uzasboSql";
import { SINGLE_ITEM_RT, strList } from "./shared";

export interface DoublePaid {
  itemId: string;
  payId: string | null;
  docDate: string | null;
  region: string | null;
  contractNumber: string | null;
  ownerName: string | null;
  times: number;
  sends: string[];
  paidTotal: number;
  share: number;
  extra: number;
}

const DOUBLE_LIMIT = 5000;

async function computeDoublePaid(): Promise<{ rows: DoublePaid[]; truncated: boolean }> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      WITH x AS (
        SELECT e AS item, u.id, u.receiver_sum
        FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_ARR}) AS e
        WHERE ${PAID} AND u.receiver_type = ${SINGLE_ITEM_RT}::int AND e ~ '^[0-9]+$'
      ), d AS (
        SELECT item::bigint AS item, count(*) AS n, sum(receiver_sum) AS paid, array_agg(id::text ORDER BY id) AS sends
        FROM x GROUP BY item HAVING count(*) > 1
      )
      SELECT d.item, d.n, d.sends, d.paid, pi.pay_id, pi.doc_date, pi.owner_sum AS share, l.name2 AS region,
             co.new_contract_number, co.owner_name
      FROM d
      LEFT JOIN payment_items pi ON pi.id = d.item
      LEFT JOIN lists l ON l.id = pi.obl_id AND l.type_id = 1
      LEFT JOIN LATERAL (
        SELECT c.new_contract_number, c.owner_name FROM vw_all_contracts c WHERE c.id = pi.contract_id LIMIT 1
      ) co ON true
      ORDER BY d.paid - COALESCE(pi.owner_sum, 0) DESC, d.item
      LIMIT ${DOUBLE_LIMIT + 1}::int`),
  );
  return {
    truncated: rows.length > DOUBLE_LIMIT,
    rows: rows.slice(0, DOUBLE_LIMIT).map((r) => {
      const share = toNum(r.share);
      const paidTotal = toNum(r.paid);
      return {
        itemId: String(r.item),
        payId: str(r.pay_id),
        docDate: isoDate(r.doc_date),
        region: str(r.region),
        contractNumber: str(r.new_contract_number),
        ownerName: str(r.owner_name),
        times: toNum(r.n),
        sends: strList(r.sends),
        paidTotal,
        share,
        extra: paidTotal - share,
      };
    }),
  };
}

export const getDoublePaid = () =>
  unstable_cache(computeDoublePaid, ["taq-double-v2"], { revalidate: 3600, tags: [PAYMENTS_CACHE_TAG] })();
