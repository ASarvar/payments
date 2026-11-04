// "To'langan" / "Topshiriqnomada": ro'yxat, qator belgilari va Excel bazaga mos kelishi.
// ⚠️ Shart keshlangan TESKARI ro'yxatdan quriladi (`server/services/unpaidItems.ts`) — bu yerda
//    bazadan to'g'ridan-to'g'ri hisoblangani bilan solishtiriladi.
import { CHANNELS, DEFAULT_FROM, ITEMS_ARR, PAID, cookieFor, get, norm, nf, ro, sum, xlsx } from "./_lib.mjs";

export const NAME = "To'langan / topshiriqnomada";

const CHECKED = ["vat", "owner", "mahalliy"];

export default async function run(t) {
  const A = await cookieFor("test-ph-admin", "ADMIN");

  for (const [key, S, , T, rt] of CHANNELS.filter((c) => CHECKED.includes(c[0]))) {
    const [e] = await ro(`WITH paid AS (
        SELECT DISTINCT e::bigint AS item FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_ARR}) AS e
        WHERE ${PAID} AND u.receiver_type = ${rt} AND e ~ '^[0-9]{1,18}$')
      SELECT count(*) FILTER (WHERE pd.item IS NOT NULL)::int AS tol_n,
             COALESCE(sum(${S}) FILTER (WHERE pd.item IS NOT NULL), 0)::float8 AS tol_s,
             count(*) FILTER (WHERE pd.item IS NULL)::int AS top_n,
             COALESCE(sum(${S}) FILTER (WHERE pd.item IS NULL), 0)::float8 AS top_s
      FROM payment_items pi LEFT JOIN paid pd ON pd.item = pi.id
      WHERE pi.state = 1 AND pi.doc_date >= '${DEFAULT_FROM}' AND ${S} > 0 AND ${T} IS TRUE`);

    for (const [holat, n, s] of [["tolangan", e.tol_n, e.tol_s], ["topshiriqnomada", e.top_n, e.top_s]]) {
      const h = await (await get(`/dashboard/royxat?kanal=${key}&holat=${holat}`, A)).text();
      const page = norm(h);
      const gotN = page.match(/">([\d,.]+)taulush/)?.[1];
      t.check(`${key} ${holat}: soni = baza`, gotN === nf(n), `${gotN} / ${nf(n)}`);
      t.check(`${key} ${holat}: summa = baza`, page.includes(`<strong>${sum(s)}</strong>`), sum(s));
      const badge = holat === "tolangan" ? "To&#x27;langan" : "Topshiriqnomada";
      t.check(`${key} ${holat}: qator belgisi`, n === 0 || h.includes(`>${badge}</span>`));
    }

    // Ikkisi birga = "o'tkazilgan" (sent IS TRUE) — holatlar bo'linishi buzilmaganini ko'rsatadi.
    const otk = norm(await (await get(`/dashboard/royxat?kanal=${key}&holat=otkazilgan`, A)).text());
    t.check(`${key} to'langan + topshiriqnomada = o'tkazilgan`, otk.includes(`">${nf(e.tol_n + e.top_n)}taulush`), nf(e.tol_n + e.top_n));
  }

  // Excel: qatorlar soni va holat ustuni
  const [key, S, , T, rt] = CHANNELS[0];
  const [x] = await ro(`WITH paid AS (
      SELECT DISTINCT e::bigint AS item FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_ARR}) AS e
      WHERE ${PAID} AND u.receiver_type = ${rt} AND e ~ '^[0-9]{1,18}$')
    SELECT count(*)::int AS n FROM payment_items pi LEFT JOIN paid pd ON pd.item = pi.id
    WHERE pi.state = 1 AND pi.doc_date >= '${DEFAULT_FROM}' AND pi.obl_id = 26 AND ${S} > 0 AND ${T} IS TRUE AND pd.item IS NOT NULL`);
  const r = await get(`/api/export?kanal=${key}&holat=tolangan&hudud=26`, A);
  t.check("Excel to'langan 200", r.status === 200, String(r.status));
  if (r.status === 200) {
    const ws = (await xlsx(r)).worksheets[0];
    t.check("Excel to'langan: qatorlar = baza", ws.rowCount - 2 === x.n, `${ws.rowCount - 2} / ${x.n}`);
    let ok = true;
    ws.eachRow((row, i) => {
      if (i > 2 && !String(row.getCell(15).value).includes("langan")) ok = false;
    });
    t.check("Excel to'langan: holat ustuni", ok);
  }
}
