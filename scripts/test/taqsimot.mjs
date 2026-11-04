// Taqsimot: hujjat sahifasi, muammoli hujjatlar, ikki marta to'langan, biriktirish zinasi va Excel.
import { DEFAULT_FROM, ITEMS_ARR, PAID, cookieFor, get, isRedirTo, nf, norm, ro, sum, today, unesc, xlsx } from "./_lib.mjs";

export const NAME = "Taqsimot";

const CH_SUMS = "vat_sum,mahalliy_sum,owner_sum,center_sum,madaniy_sum,sport_sum,defense_sum,eco_sum,medicine_sum,penya_sum,jarima_sum,mail_sum".split(",");
const sharesSql = CH_SUMS.map((c) => `COALESCE(sum(${c}) FILTER (WHERE ${c} > 0), 0)`).join(" + ");

export default async function run(t) {
  const A = await cookieFor("test-taq-admin", "ADMIN");
  const d = today();

  // ── Hujjat sahifasi ──
  const [doc] = await ro(`SELECT p.id::text AS id, p.asum::float8 AS asum, count(pi.*)::int AS items
    FROM paydocs p JOIN payment_items pi ON pi.pay_id = p.id
    WHERE p.state = 1 GROUP BY p.id HAVING count(*) FILTER (WHERE pi.state = 1) = 3 ORDER BY p.id LIMIT 1`);
  const [shares] = await ro(`SELECT (${sharesSql})::float8 AS s FROM payment_items WHERE state = 1 AND pay_id = ${doc.id}`);
  const idRows = await ro(`SELECT id::text AS id FROM payment_items WHERE pay_id = ${doc.id}`);
  const idList = idRows.map((r) => `'${r.id}'`).join(",");
  const [sendCount] = await ro(`SELECT count(*)::int AS n FROM uzasbo_send u
    WHERE u.state = 1 AND ${ITEMS_ARR} && ARRAY[${idList}]`);

  let html = await (await get(`/dashboard/taqsimot?id=${doc.id}`, A)).text();
  let page = unesc(norm(html));
  t.check("hujjat sarlavhasi", page.includes(`Hujjat#${doc.id}`));
  t.check("qismlar soni", page.includes(`Qismlar—${doc.items}ta`), String(doc.items));
  t.check("kanallarga taqsimlangan = baza", page.includes(`Kanallargataqsimlanganjami:<strong>${sum(shares.s)}</strong>`), sum(shares.s));
  const shown = Number(page.match(/topshiriqnomalar—(\d+)ta/)?.[1] ?? -1);
  t.check("topshiriqnomalar (ko'rsatilgan <= jami)", shown > 0 && shown <= sendCount.n, `${shown} / ${sendCount.n}`);

  t.check("qism ID -> hujjatga yo'naltiradi", isRedirTo(await get(`/dashboard/taqsimot?id=${idRows[0].id}`, A), `id=${doc.id}`));
  t.check("topilmadi xabari", unesc(norm(await (await get("/dashboard/taqsimot?id=999999999", A)).text())).includes("topilmadi"));
  t.check("noto'g'ri ID xabari", unesc(norm(await (await get("/dashboard/taqsimot?id=abc", A)).text())).includes("faqatraqamlardan"));

  // ── Muammoli hujjatlar ──
  const [prob] = await ro(`WITH d AS (SELECT id, asum FROM paydocs WHERE state = 1 AND doc_date >= '${DEFAULT_FROM}'),
      x AS (SELECT pay_id, sum(asum) AS s FROM payment_items WHERE state = 1 GROUP BY pay_id)
    SELECT count(*) FILTER (WHERE x.pay_id IS NULL)::int AS none,
           count(*) FILTER (WHERE x.s < d.asum)::int AS part,
           count(*) FILTER (WHERE x.s > d.asum)::int AS over
    FROM d LEFT JOIN x ON x.pay_id = d.id`);
  page = norm(await (await get("/dashboard/taqsimot/muammoli", A)).text());
  for (const [k, v] of [["taqsimlanmagan", prob.none], ["qisman", prob.part], ["ortiqcha", prob.over]]) {
    t.check(`muammoli: ${k} soni = baza`, page.includes(`">${nf(v)}ta<span`), String(v));
  }

  // ── Ikki marta to'langan (faqat balansda saqlovchi, rt 4) ──
  const dbl = await ro(`WITH x AS (SELECT e AS item FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_ARR}) AS e
      WHERE ${PAID} AND u.receiver_type = 4)
    SELECT item FROM x GROUP BY 1 HAVING count(*) > 1`);
  page = norm(await (await get("/dashboard/taqsimot/takroriy", A)).text());
  t.check("takroriy: soni = baza", page.includes(`">${nf(dbl.length)}taqism·`), String(dbl.length));

  // ── Biriktirish borishi (respublika jadvali Excel'da) ──
  const [bir] = await ro(`SELECT
      (SELECT COALESCE(sum(asum), 0) FROM paydocs WHERE state = 1 AND obl_id > 0 AND doc_date BETWEEN '${DEFAULT_FROM}' AND '${d}')::float8 AS tushum,
      ((SELECT COALESCE(sum(parsing_sum), 0) FROM payments WHERE state = 1 AND obl_id > 0 AND doc_date BETWEEN '${DEFAULT_FROM}' AND '${d}')
       + (SELECT COALESCE(sum(real_sum), 0) FROM munis_receive_payment WHERE state = 1 AND obl_id > 0 AND status > 'NEW'
          AND created_at >= '${DEFAULT_FROM}' AND created_at < '${d}'::date + 1))::float8 AS bir`);
  const r = await get(`/api/taqsimot/biriktirish?dan=${DEFAULT_FROM}&gacha=${d}`, A);
  t.check("biriktirish Excel 200", r.status === 200, String(r.status));
  if (r.status === 200) {
    const ws = (await xlsx(r)).worksheets[0];
    const jr = ws.getRow(4);
    const v = (c) => Number(jr.getCell(c).value) * 1e6;
    t.check("biriktirish: 14 hudud", ws.rowCount === 18, String(ws.rowCount));
    t.check("biriktirish: tushum = baza", Math.abs(v(6) - bir.tushum) < 1, `${v(6)} / ${bir.tushum}`);
    t.check("biriktirish: biriktirilgan = baza", Math.abs(v(8) - bir.bir) < 1, `${v(8)} / ${bir.bir}`);
    t.check("biriktirish: tushum = biriktirilgan + biriktirilmagan", Math.abs(v(6) - v(8) - v(7)) < 1);
  }

  // ── Hudud → hujjatlar ro'yxati va ochiladigan kanallar jadvali ──
  const [tosh] = await ro(`SELECT count(*)::int AS n,
      count(*) FILTER (WHERE x.asum - x.bir > 0.005)::int AS qoldiq,
      count(*) FILTER (WHERE abs(x.asum - x.bir) <= 0.005)::int AS toliq,
      count(*) FILTER (WHERE x.asum - x.bir < -0.005)::int AS ortiqcha
    FROM (SELECT p.asum,
            COALESCE((SELECT sum(parsing_sum) FROM payments y WHERE y.state = 1 AND y.pay_id = p.id), 0)
            + COALESCE((SELECT sum(real_sum) FROM munis_receive_payment m WHERE m.state = 1 AND m.status > 'NEW' AND m.pay_id = p.id), 0) AS bir
          FROM paydocs p WHERE p.state = 1 AND p.obl_id = 26 AND p.doc_date BETWEEN '${DEFAULT_FROM}' AND '${d}') x`);
  const q = `hudud=26&dan=${DEFAULT_FROM}&gacha=${d}`;
  const docCount = async (extra = "") => {
    const s = norm(await (await get(`/dashboard/taqsimot/biriktirish/hujjatlar?${q}${extra}`, A)).text());
    return Number(s.match(/">([\d,.]+)tahujjat/)?.[1]?.replace(/,/g, "") ?? -1);
  };
  t.check("hujjatlar soni = baza", (await docCount()) === tosh.n, String(tosh.n));
  const holatlar = [await docCount("&holat=biriktirilmagan"), await docCount("&holat=toliq"), await docCount("&holat=ortiqcha")];
  t.check(
    "hujjatlar: holatlar = baza",
    holatlar.join("/") === [tosh.qoldiq, tosh.toliq, tosh.ortiqcha].join("/"),
    `${holatlar.join("/")} - ${tosh.qoldiq}/${tosh.toliq}/${tosh.ortiqcha}`,
  );

  html = await (await get(`/dashboard/taqsimot/biriktirish/hujjatlar?${q}`, A)).text();
  const pageIds = [...new Set([...html.matchAll(/ochiq=(\d+)/g)].map((m) => m[1]))];
  // Ulushi BOR hujjat tanlanadi — aks holda tekshiruv nolni nol bilan solishtirardi.
  const [best] = pageIds.length
    ? await ro(`SELECT pay_id::text AS id FROM payment_items WHERE state = 1 AND pay_id IN (${pageIds.join(",")})
        GROUP BY pay_id ORDER BY sum(asum) DESC LIMIT 1`)
    : [];
  const openId = best?.id ?? pageIds[0];
  t.check("qatorda ochish havolasi", Boolean(openId), `${pageIds.length} ta hujjat`);
  if (openId) {
    const [openShares] = await ro(`SELECT (${sharesSql})::float8 AS s FROM payment_items WHERE state = 1 AND pay_id = ${openId}`);
    const opened = unesc(norm(await (await get(`/dashboard/taqsimot/biriktirish/hujjatlar?${q}&ochiq=${openId}`, A)).text()));
    t.check("ochilgan panel: sarlavha", opened.includes(`Kanallarbo'yicha—hujjat#${openId}`));
    t.check("ochilgan panel: summa = baza", opened.includes(`Kanallargataqsimlanganjami:<strong>${sum(openShares.s)}</strong>`), sum(openShares.s));
  }
  const ghost = unesc(norm(await (await get(`/dashboard/taqsimot/biriktirish/hujjatlar?${q}&ochiq=999999999`, A)).text()));
  t.check("sahifada yo'q ID: panel ochilmaydi", !ghost.includes("Kanallarbo'yicha—hujjat"));

  // ── Hujjat Excel (4 varaq) ──
  const re = await get(`/api/taqsimot?id=${doc.id}`, A);
  t.check("hujjat Excel 200", re.status === 200, String(re.status));
  if (re.status === 200) {
    const wb = await xlsx(re);
    t.check("hujjat Excel: varaqlar", wb.worksheets.map((w) => w.name).join(",") === "Hujjat,Kanallar,Qismlar,Topshiriqnomalar");
    t.check("hujjat Excel: qismlar soni", wb.getWorksheet("Qismlar").rowCount - 1 === doc.items);
  }
}
