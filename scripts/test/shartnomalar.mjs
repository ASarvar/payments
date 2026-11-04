// Shartnomalar bo'yicha: yil tanlovi, jadval va Excel bazaga mos kelishi.
import { cookieFor, get, nf, norm, ro, today, unesc, xlsx } from "./_lib.mjs";

export const NAME = "Shartnomalar bo'yicha";

export default async function run(t) {
  const A = await cookieFor("test-sh-admin", "ADMIN");
  const yil = Number(today().slice(0, 4));

  const [e] = await ro(`SELECT
      (SELECT count(*) FROM vw_contracts WHERE state = 1 AND doc_status = 3 AND doc_year::text = '${yil}'
         AND type IN (1, 2) AND obl_id > 0)::int AS cnt,
      (SELECT COALESCE(sum(credit_sum), 0) + COALESCE(sum(penya), 0) FROM billing
         WHERE state = 1 AND ayear::text = '${yil}' AND obl_id > 0)::float8 AS hisob,
      (SELECT COALESCE(sum(asum), 0) FROM payment_items
         WHERE state = 1 AND ayear::text = '${yil}' AND pay_type IN (1, 2) AND obl_id > 0)::float8 AS paid`);

  const html = await (await get(`/dashboard/shartnomalar?yil=${yil}`, A)).text();
  const page = unesc(norm(html));
  t.check("sahifa ochildi", page.includes("Shartnomalarbo'yicha") || page.includes("Shartnomalar"), "sarlavha");
  t.check("yil tanlovi", html.includes(`value="${yil}"`), String(yil));
  t.check("shartnomalar soni = baza", page.includes(`>${nf(e.cnt)}<`) || norm(html).includes(`>${nf(e.cnt)}<`), nf(e.cnt));

  const r = await get(`/api/shartnomalar?yil=${yil}`, A);
  t.check("Excel 200", r.status === 200, String(r.status));
  if (r.status === 200) {
    const ws = (await xlsx(r)).worksheets[0];
    const j = ws.getRow(4); // 1 — sarlavha, 2–3 — jadval boshi, 4 — JAMI
    t.check("Excel: soni = baza", Number(j.getCell(3).value) === e.cnt, `${j.getCell(3).value} / ${e.cnt}`);
    t.check("Excel: hisoblangan = baza", Math.abs(Number(j.getCell(5).value) * 1e6 - e.hisob) < 1, `${Number(j.getCell(5).value) * 1e6} / ${e.hisob}`);
    t.check("Excel: to'langan = baza", Math.abs(Number(j.getCell(11).value) * 1e6 - e.paid) < 1, `${Number(j.getCell(11).value) * 1e6} / ${e.paid}`);
    t.check("Excel: 14 hudud + JAMI", ws.rowCount === 18, String(ws.rowCount));
  }
}
