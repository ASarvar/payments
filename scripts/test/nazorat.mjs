import { CHANNELS, DEFAULT_FROM, PAID, PAID_CTE, cookieFor, get, mln, norm, paidBit, ro, rowCells, sum, today, unesc } from "./_lib.mjs";

export const NAME = "Nazorat paneli";

async function channelAgg(extra = "") {
  const [row] = await ro(`WITH ${PAID_CTE}
    SELECT ${CHANNELS.map(([k, S, A, T, rt]) => `
      COALESCE(sum(${S}) FILTER (WHERE ${S} > 0), 0)::float8 AS ${k}_jami,
      COALESCE(sum(${S}) FILTER (WHERE ${S} > 0 AND ${T} IS TRUE AND ${paidBit(rt)}), 0)::float8 AS ${k}_tol,
      COALESCE(sum(${S}) FILTER (WHERE ${S} > 0 AND ${T} IS TRUE AND NOT ${paidBit(rt)}), 0)::float8 AS ${k}_top,
      COALESCE(sum(${S}) FILTER (WHERE ${S} > 0 AND ${A} IS TRUE AND ${T} IS NOT TRUE), 0)::float8 AS ${k}_otk,
      COALESCE(sum(${S}) FILTER (WHERE ${S} > 0 AND ${A} IS NOT TRUE AND ${T} IS NOT TRUE), 0)::float8 AS ${k}_tas`).join(",")}
    FROM payment_items pi LEFT JOIN paid pd ON pd.item = pi.id
    WHERE pi.state = 1 AND pi.doc_date >= '${DEFAULT_FROM}' ${extra}`);
  const tot = (k) => CHANNELS.reduce((a, [c]) => a + row[`${c}_${k}`], 0);
  return { row, tot };
}

export default async function run(t) {
  const A = await cookieFor("test-naz-admin", "ADMIN");
  const d = today();
  const { row, tot } = await channelAgg();

  let split = true;
  for (const [c] of CHANNELS) {
    if (Math.abs(row[`${c}_jami`] - row[`${c}_tol`] - row[`${c}_top`] - row[`${c}_otk`] - row[`${c}_tas`]) > 0.01) split = false;
  }
  t.check("baza: jami = to'langan + topshiriqnomada + o'tkazilmagan + tasdiqlanmagan", split);

  const html = await (await get("/dashboard", A)).text();
  const page = unesc(norm(html));
  t.check("sahifa bo'limlari", ["Pulyo'li", "Hududlarsvetofori", "Kunlikdinamika", "Kanallarbo'yichataqsimot"].every((s) => page.includes(s)));
  t.check("pul yo'li: 6 bosqich", ["Tushum", "Biriktirildi", "12kanalgataqsimlandi", "Tasdiqlandi", "Topshiriqnomagakiritildi", "aznachilikto'ladi"].every((s) => page.includes(s)));

  const j = rowCells(html, "JAMI");
  t.check("JAMI hisoblangan = baza", j[1] === sum(tot("jami")), `${j[1]} / ${sum(tot("jami"))}`);
  t.check("JAMI to'langan = baza", j[2] === sum(tot("tol")), `${j[2]} / ${sum(tot("tol"))}`);
  t.check("JAMI topshiriqnomada = baza", j[4] === sum(tot("top")), `${j[4]} / ${sum(tot("top"))}`);
  t.check("JAMI o'tkazilmagan summa = baza", j[6] === sum(tot("otk")), `${j[6]} / ${sum(tot("otk"))}`);
  const q = rowCells(html, "QQS");
  t.check("QQS qatori = baza", q[1] === sum(row.vat_jami) && q[2] === sum(row.vat_tol), `${q[1]} / ${sum(row.vat_jami)}`);

  t.check("ro'yxat havolalari", html.includes("holat=tolangan") && html.includes("holat=topshiriqnomada"));
  t.check("yo'qotish havolalari", html.includes('href="#kanallar"') && html.includes("/dashboard/taqsimot/biriktirish?"));
  t.check("svetofor: hudud havolasi", html.includes("hudud=26"));
  t.check("kesh vaqti ko'rsatilgan", page.includes("hisoblangan:"));

  const from = new Date(`${d}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  const f30 = from.toISOString().slice(0, 10);
  const [dyn] = await ro(`SELECT
      (SELECT COALESCE(sum(asum), 0) FROM paydocs WHERE state = 1 AND obl_id > 0 AND doc_date BETWEEN '${f30}' AND '${d}')::float8 AS t,
      (SELECT COALESCE(sum(u.receiver_sum), 0) FROM uzasbo_send u WHERE ${PAID} AND u.uzasbo_treas_oper_date BETWEEN '${f30}' AND '${d}')::float8 AS u`);
  t.check("dinamika: tushum (30 kun) = baza", page.includes(`Tushum:${mln(dyn.t)}mln`), mln(dyn.t));
  t.check("dinamika: g'aznachilik (30 kun) = baza", page.includes(`to'lagan:${mln(dyn.u)}mln`), mln(dyn.u));
  t.check("dinamika: grafik chizilgan", html.includes("<svg") && html.includes("<title>"));

  const agg26 = await channelAgg("AND pi.obl_id = 26");
  const j26 = rowCells(await (await get("/dashboard?hudud=26", A)).text(), "JAMI");
  t.check("hudud=26: JAMI hisoblangan = baza", j26[1] === sum(agg26.tot("jami")), `${j26[1]} / ${sum(agg26.tot("jami"))}`);

  const [areaRow] = await ro(`SELECT area_id AS area FROM payment_items WHERE state = 1 AND obl_id = 26 AND area_id IS NOT NULL LIMIT 1`);
  const tuman = unesc(norm(await (await get(`/dashboard?hudud=26&tuman=${areaRow.area}`, A)).text()));
  t.check("tuman: kirim bosqichlarisiz", tuman.includes("Tumantanlangan"));

  const bad = unesc(norm(await (await get("/dashboard?dan=2026-01-10&gacha=2026-01-01", A)).text()));
  t.check("noto'g'ri sana: ogohlantirish", bad.includes("Boshlanishsanasioxirgisanadankeyin"));
}
