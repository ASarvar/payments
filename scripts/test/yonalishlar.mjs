import { CHANNELS, DEFAULT_FROM, PAID_CTE, cookieFor, get, mln, norm, paidBit, ro, rowCells, sum, unesc, xlsx } from "./_lib.mjs";

export const NAME = "Yo'nalishlar bo'yicha";

async function agg(extra = "") {
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
  const qoldiq = CHANNELS.reduce((a, [c]) => a + (row[`${c}_jami`] - row[`${c}_tol`]), 0);
  return { row, tot, qoldiq };
}

export default async function run(t) {
  const A = await cookieFor("test-yon-admin", "ADMIN");
  const { row, tot, qoldiq } = await agg();

  t.check("baza: chiqishi kerak = tasdiqlanmagan + kiritilmagan + topshiriqnomada",
    Math.abs(qoldiq - tot("tas") - tot("otk") - tot("top")) < 0.01, sum(qoldiq));

  const html = await (await get("/dashboard/yonalishlar", A)).text();
  const page = unesc(norm(html));
  t.check("ikkala jadval", page.includes("Yo'nalishlarbo'yicha") && page.includes("Yo'nalish×hudud—chiqishikerakbo'lgansumma"));

  const j = rowCells(html, "JAMI");
  t.check("JAMI hisoblangan = baza", j[1] === sum(tot("jami")), `${j[1]} / ${sum(tot("jami"))}`);
  t.check("JAMI to'langan = baza", j[2] === sum(tot("tol")), `${j[2]} / ${sum(tot("tol"))}`);
  t.check("JAMI chiqishi kerak = baza", j[4] === sum(qoldiq), `${j[4]} / ${sum(qoldiq)}`);
  t.check("JAMI tarkibi = baza", j[5] === sum(tot("tas")) && j[6] === sum(tot("otk")) && j[7] === sum(tot("top")), `${j[5]}/${j[6]}/${j[7]}`);

  const q = rowCells(html, "QQS");
  t.check("QQS qatori = baza", q[1] === sum(row.vat_jami) && q[4] === sum(row.vat_jami - row.vat_tol), `${q[4]} / ${sum(row.vat_jami - row.vat_tol)}`);

  const a26 = await agg("AND pi.obl_id = 26");
  const cell = mln(a26.row.vat_jami - a26.row.vat_tol);
  t.check("hudud kesimi: QQS x Toshkent sh. (mln)", norm(html).includes(`>${cell}<`), cell);

  const j26 = rowCells(await (await get("/dashboard/yonalishlar?hudud=26", A)).text(), "JAMI");
  t.check("hudud=26: JAMI hisoblangan = baza", j26[1] === sum(a26.tot("jami")), `${j26[1]} / ${sum(a26.tot("jami"))}`);

  const r = await get(`/api/yonalishlar?dan=${DEFAULT_FROM}`, A);
  t.check("Excel 200", r.status === 200, String(r.status));
  if (r.status === 200) {
    const wb = await xlsx(r);
    const names = wb.worksheets.map((w) => w.name).join(",");
    t.check("Excel: ikki varaq", names === "Yo'nalishlar,Yo'nalish × hudud", names);
    const ws = wb.worksheets[0];
    const jr = ws.getRow(4);
    t.check("Excel: JAMI hisoblangan = baza", Math.abs(Number(jr.getCell(3).value) - tot("jami")) < 1);
    t.check("Excel: JAMI chiqishi kerak = baza", Math.abs(Number(jr.getCell(6).value) - qoldiq) < 1);
    t.check("Excel: 12 yo'nalish", ws.rowCount === 16, String(ws.rowCount));
    const ws2 = wb.worksheets[1];
    t.check("Excel: hudud varag'i JAMI (mln)", Math.abs(Number(ws2.getRow(3).getCell(ws2.columnCount).value) * 1e6 - qoldiq) < 1);
  }
}
