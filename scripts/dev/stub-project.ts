/**
 * DEV: `project` bazasining SOXTA nusxasi — ilova ishlatadigan jadvallar va
 * ustunlar serverdagi bilan AYNAN bir xil nom va tipda, ma'lumot tasodifiy.
 *
 *   npm run dev:stub
 *
 * ⚠️ XAVFSIZLIK: faqat nomida "stub" bo'lgan bazaga yozadi. Bu skript jadvallarni
 * O'CHIRIB qayta yaratadi — adashib haqiqiy `project` ga ulansa, boshqa tizimning
 * to'lovlarini yo'q qilardi.
 *
 * Ataylab qo'yilgan holatlar (UI ularni ko'rsatishi kerak):
 *   - tasdiqlanmasdan o'tkazilgan ulushlar (anomaliya, ~1%);
 *   - faol shartnomasi yo'q to'lovlar (contract_id 8001–8400);
 *   - hisob raqami/MFO'si yo'q shartnomalar (~5%);
 *   - `vw_all_contracts` da DUBLIKAT id'lar — summalar ko'paymasligini tekshirish uchun;
 *   - `state = 0` (bekor) yozuvlar (~10%) — hisobotga kirmasligi kerak;
 *   - `sent_*` da `false` ham, `NULL` ham;
 *   - Taqsimot: qismi yo'q / qisman / ortiqcha taqsimlangan hujjatlar, rad etilgan va qayta
 *     yaratilgan, IKKI MARTA to'langan topshiriqnomalar, belgisi bor-u topshiriqnomasiz ulushlar (~2%).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { CHANNELS } from "../../src/lib/channels";

const ROWS = 60_000;

/** Kanal ulushi (to'lov summasidan) — ifoda `b.asum` ga tayanadi. */
const SHARE: Record<string, string> = {
  vat: "CASE WHEN b.doc >= date '2024-01-01' THEN round(b.asum * 12 / 112, 4) ELSE 0 END",
  mahalliy: "round(b.asum * 0.30, 4)",
  owner: "round(b.asum * 0.40, 4)",
  center: "round(b.asum * 0.10, 4)",
  madaniy: "CASE WHEN random() < 0.3 THEN round(b.asum * 0.02, 4) ELSE 0 END",
  sport: "CASE WHEN random() < 0.3 THEN round(b.asum * 0.02, 4) ELSE 0 END",
  defence: "CASE WHEN random() < 0.2 THEN round(b.asum * 0.01, 4) ELSE 0 END",
  eco: "CASE WHEN random() < 0.15 THEN round(b.asum * 0.01, 4) ELSE 0 END",
  medicine: "CASE WHEN random() < 0.15 THEN round(b.asum * 0.01, 4) ELSE 0 END",
  penya: "CASE WHEN random() < 0.1 THEN round((random() * 50000)::numeric, 4) ELSE 0 END",
  jarima: "CASE WHEN random() < 0.05 THEN round((random() * 100000)::numeric, 4) ELSE 0 END",
  mail: "0",
};

async function main() {
  const url = process.env.PROJECT_DATABASE_URL;
  if (!url) throw new Error("PROJECT_DATABASE_URL berilmagan");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.includes("stub")) {
    throw new Error(`XAVFLI: "${dbName}" — soxta baza emas (nomida "stub" yo'q). To'xtatildi.`);
  }

  const p = new PrismaClient({ datasourceUrl: url });
  const run = (sql: string) => p.$executeRawUnsafe(sql);
  try {
    await run("DROP TABLE IF EXISTS munis_receive_payment");
    await run("DROP TYPE IF EXISTS munis_receive_payment_status");
    await run("DROP TABLE IF EXISTS payments");
    await run("DROP TABLE IF EXISTS uzasbo_send");
    await run("DROP TYPE IF EXISTS uzasbo_send_status");
    await run("DROP TABLE IF EXISTS paydocs");
    await run("DROP TABLE IF EXISTS payment_items");
    await run("DROP TABLE IF EXISTS lists");
    await run("DROP TABLE IF EXISTS vw_all_contracts");

    // ── lists: hududlar (serverdagi aynan id va nomlar) + har hududga 5 ta tuman ──
    await run(`CREATE TABLE lists (type_id int NOT NULL, id bigint NOT NULL, name2 varchar(255), PRIMARY KEY (type_id, id))`);
    await run(`INSERT INTO lists (type_id, id, name2) VALUES
      (1,0,'Respublika'),(1,3,'Andijon'),(1,6,'Buxoro'),(1,8,'Jizzax'),(1,10,'Qashqadaryo'),(1,12,'Navoiy'),
      (1,14,'Namangan'),(1,18,'Samarqand'),(1,22,'Surxondaryo'),(1,24,'Sirdaryo'),(1,26,'Toshkent sh.'),
      (1,27,'Toshkent v.'),(1,30,'Farg‘ona'),(1,33,'Xorazm'),(1,35,'Qoraqalpog‘iston')`);
    await run(`INSERT INTO lists (type_id, id, name2)
      SELECT 2, l.id * 100 + k, l.name2 || ' ' || k || '-tuman' FROM lists l, generate_series(1, 5) k
      WHERE l.type_id = 1 AND l.id <> 0`);

    // ── vw_all_contracts: serverda VIEW, bu yerda oddiy jadval (ilovaga farqi yo'q) ──
    await run(`CREATE TABLE vw_all_contracts (
      id bigint, state int, doc_status int, new_contract_number varchar(255),
      owner_tin bigint, owner_name varchar, owner_mfo varchar, owner_account varchar)`);
    await run(`INSERT INTO vw_all_contracts
      SELECT g,
             CASE WHEN random() < 0.95 THEN 1 ELSE 0 END,
             CASE WHEN random() < 0.95 THEN 3 ELSE 1 END,
             'IJ-' || (2023 + g % 4) || '-' || lpad(g::text, 5, '0'),
             200000000 + (g % 700),
             'Balansda saqlovchi tashkilot № ' || (g % 700),
             CASE WHEN random() < 0.05 THEN NULL ELSE lpad((g % 90 + 10)::text, 5, '0') END,
             CASE WHEN random() < 0.05 THEN '' ELSE '2020' || lpad(((g::bigint * 7919) % 100000000)::text, 16, '0') END
      FROM generate_series(1, 8000) g`);
    // Dublikatlar — EXISTS/LATERAL summalarni ko'paytirmasligini sinash uchun.
    await run(`INSERT INTO vw_all_contracts SELECT * FROM vw_all_contracts WHERE id % 97 = 0 AND state = 1 AND doc_status = 3`);

    // ── payment_items: serverdagi nomlar va tiplar (faqat ilova o'qiydigan ustunlar) ──
    const chCols = CHANNELS.map((c) => {
      const sumType = "numeric(18,4)";
      // Serverda vat_accept'da standart qiymat yo'q, qolgan *_accept'lar DEFAULT false.
      const acc = c.key === "vat" ? `${c.accept} boolean` : `${c.accept} boolean DEFAULT false`;
      const sumCol = c.key === "vat" ? "" : `${c.sum} ${sumType}, `; // vat_sum pastda NOT NULL
      return `${sumCol}${acc}, ${c.sent} boolean`;
    }).join(",\n      ");
    await run(`CREATE TABLE payment_items (
      id bigint PRIMARY KEY, obl_id int, area_id int, contract_id bigint NOT NULL,
      asum numeric(18,2) NOT NULL, vat_sum numeric(18,4) NOT NULL, state int,
      created_at timestamp, updated_at timestamp, pay_id bigint, doc_date date NOT NULL, owner_tin bigint,
      ${chCols})`);

    const insertCols = CHANNELS.flatMap((c) => (c.key === "vat" ? [c.accept] : [c.sum, c.accept]));
    const insertVals = CHANNELS.flatMap((c) => {
      const acc =
        c.key === "vat"
          ? "CASE WHEN random() < 0.25 THEN NULL ELSE random() < 0.95 END" // QQS'da bo'sh (ko'rilmagan) ko'p
          : "random() < 0.9";
      return c.key === "vat" ? [acc] : [SHARE[c.key], acc];
    });
    await run(`INSERT INTO payment_items (id, obl_id, area_id, contract_id, asum, vat_sum, state, created_at, updated_at,
                                          pay_id, doc_date, owner_tin, ${insertCols.join(", ")})
      SELECT b.id, b.obl,
             -- (id / 15), (id % 5) EMAS: hudud id % 15 bilan tanlanadi, 5 esa 15 ni
             -- bo'ladi — har hududga faqat BITTA tuman tushib qolardi.
             CASE WHEN b.obl = 0 THEN NULL ELSE b.obl * 100 + 1 + ((b.id / 15) % 5) END,
             b.cid, b.asum, ${SHARE.vat}, b.state,
             -- Kelajakdagi vaqt bo'lmasin ("oxirgi biriktirish" bugundan keyin chiqmasin).
             LEAST(b.doc + (random() * interval '20 days'), localtimestamp),
             LEAST(b.doc + (random() * interval '40 days'), localtimestamp),
             100000 + b.grp, b.doc, 200000000 + (b.cid % 700),
             ${insertVals.join(", ")}
      FROM (
        SELECT g AS id,
               (ARRAY[35,3,6,8,10,12,14,18,22,24,27,30,33,26,0])[1 + (g % 15)] AS obl,
               1 + ((g::bigint * 31) % 8400) AS cid,
               round((random() * 9900000 + 100000)::numeric, 2) AS asum,
               CASE WHEN random() < 0.9 THEN 1 ELSE 0 END AS state,
               -- Bitta to'lov hujjati (pay_id) — uchta qism (g, g+15, g+30): bir hudud, bir sana.
               (g % 15) + 15 * (g / 45) AS grp,
               date '2023-08-01' + ((((g % 15) + 15 * (g / 45))::bigint * 7919) % (current_date - date '2023-08-01'))::int AS doc
        FROM generate_series(1, ${ROWS}) g
      ) b`);

    // O'tkazildi belgilari tasdiqqa bog'liq: tasdiqlanganlarning ~70% i o'tkazilgan,
    // qolganida `false` ham, NULL ham bor; tasdiqlanmaganlarning ~1% i — anomaliya.
    const sentSet = CHANNELS.map(
      (c) => `${c.sent} = CASE
        WHEN ${c.accept} IS TRUE THEN (CASE WHEN random() < 0.7 THEN true WHEN random() < 0.4 THEN false ELSE NULL END)
        WHEN random() < 0.01 THEN true ELSE NULL END`,
    ).join(",\n        ");
    await run(`UPDATE payment_items SET ${sentSet}`);

    await run("CREATE INDEX ON payment_items (state, obl_id, doc_date, area_id)");

    // ── paydocs: to'lov hujjatlari. Summa = faol qismlar yig'indisi (hammasi bekor bo'lsa — barchasi) ──
    await run(`CREATE TABLE paydocs (
      id bigint PRIMARY KEY, doc_type int, doc_num varchar, doc_date date, asum numeric(18,2),
      cl_name varchar, ca_name varchar, anote varchar(800), type varchar(100),
      created_at timestamp DEFAULT now(), state int, obl_id int, area_id int)`);
    await run(`INSERT INTO paydocs (id, doc_type, doc_num, doc_date, asum, cl_name, ca_name, anote, type, created_at, state, obl_id, area_id)
      SELECT pi.pay_id, 1, (pi.pay_id % 97)::text, min(pi.doc_date),
             COALESCE(sum(pi.asum) FILTER (WHERE pi.state = 1), sum(pi.asum)),
             (300000000 + pi.pay_id % 700) || ' MCHJ "SOXTA TO''LOVCHI ' || (pi.pay_id % 700) || '" 2020800020'
               || lpad(pi.pay_id::text, 10, '0') || ' 01125',
             '201122919 Иктисодиёт ва молия вазирлигининг Ягона газна хисобвараги 23402000300100001010 00014',
             '09510~401421860262737041908021001~201502223~09510 Оплата по аренде согласно договора № '
               || min(pi.contract_id) || '#FID=' || pi.pay_id,
             'Поступление', min(pi.created_at), 1, max(pi.obl_id), max(pi.area_id)
      FROM payment_items pi GROUP BY pi.pay_id`);
    // Ataylab: ~1% qisman (summa oshirilgan), ~0.5% ortiqcha (kamaytirilgan), qismsiz va bekor hujjatlar.
    await run(`UPDATE paydocs SET asum = asum + round((random() * 500000 + 1000)::numeric, 2) WHERE id % 101 = 0`);
    await run(`UPDATE paydocs SET asum = round(asum * 0.8, 2) WHERE id % 211 = 0 AND id % 101 <> 0`);
    await run(`INSERT INTO paydocs (id, doc_type, doc_num, doc_date, asum, cl_name, ca_name, anote, type, state, obl_id)
      SELECT 900000 + g, 1, g::text, date '2023-08-01' + (g * 37 % (current_date - date '2023-08-01')),
             round((random() * 9000000 + 100000)::numeric, 2), 'TAQSIMLANMAGAN TO''LOVCHI ' || g, 'Ягона газна хисобвараги',
             'Shartnoma raqami ko''rsatilmagan to''lov', 'Поступление', 1,
             (ARRAY[35,3,6,8,10,12,14,18,22,24,27,30,33,26,0])[1 + (g % 15)]
      FROM generate_series(1, 300) g`);
    await run(`INSERT INTO paydocs (id, doc_type, doc_num, doc_date, asum, cl_name, type, state, obl_id)
      SELECT 950000 + g, 2, g::text, current_date - g, round((random() * 5000000)::numeric, 2), 'Qaytarish ' || g, 'Возврат', 0, 26
      FROM generate_series(1, 200) g`);
    // Bugungi kirimlar — "Biriktirish borishi"dagi "bir kunda" ustunlari uchun.
    await run(`INSERT INTO paydocs (id, doc_type, doc_num, doc_date, asum, cl_name, type, state, obl_id)
      SELECT 960000 + g, 1, g::text, current_date, round((random() * 3000000 + 100000)::numeric, 2), 'Bugungi to''lovchi ' || g,
             'Поступление', 1, (ARRAY[3,6,14,26,27])[1 + g % 5]
      FROM generate_series(1, 25) g`);

    // ── payments: hujjatdan ajratilgan summa turlar bo'yicha — "Biriktirish borishi" manbai ──
    await run(`CREATE TABLE payments (
      id bigint PRIMARY KEY, doc_date date, asum numeric(18,2), cl_name varchar(250), parsing_sum numeric(18,2),
      pay_id bigint, state int, obl_id int, created_at timestamp,
      rent_sum numeric(18,2), penya_sum numeric(18,2), mail_sum numeric(18,2), tax_sum numeric(18,2), fine_sum numeric(18,2),
      advance_sum numeric(18,2), unknown_sum numeric(18,2), returned_sum numeric(18,2), returned_sum2 numeric(18,2),
      other_sum numeric(18,2), vat_sum numeric(18,2))`);
    // ~90% hujjat shu yo'l bilan biriktirilgan (har 7-sida 10% qoldiq), qolgan 10% — MUNIS orqali.
    await run(`INSERT INTO payments (id, doc_date, asum, cl_name, parsing_sum, pay_id, state, obl_id, created_at,
                                     rent_sum, penya_sum, mail_sum, tax_sum, fine_sum, advance_sum, unknown_sum,
                                     returned_sum, returned_sum2, other_sum, vat_sum)
      SELECT 5000000 + x.id, x.doc_date, x.asum, x.cl_name, x.ps, x.id, 1, x.obl_id, x.created_at,
             round(x.ps * 0.90, 2), round(x.ps * 0.03, 2), 0, 0, round(x.ps * 0.01, 2), round(x.ps * 0.02, 2),
             round(x.ps * 0.01, 2), round(x.ps * 0.01, 2), round(x.ps * 0.005, 2),
             x.ps - round(x.ps * 0.90, 2) - round(x.ps * 0.03, 2) - round(x.ps * 0.01, 2) - round(x.ps * 0.02, 2)
                  - round(x.ps * 0.01, 2) - round(x.ps * 0.01, 2) - round(x.ps * 0.005, 2),
             round(x.ps * 12 / 112, 2)
      FROM (SELECT p.*, CASE WHEN p.id % 7 = 0 THEN round(p.asum * 0.9, 2) ELSE p.asum END AS ps
            FROM paydocs p WHERE p.state = 1 AND p.id % 10 <> 0) x`);

    // ── munis_receive_payment: MUNIS orqali kelgan to'lovlar (holati ENUM, tartibi serverdagidek) ──
    await run(`CREATE TYPE munis_receive_payment_status AS ENUM ('NEW', 'UPDATED', 'DISTRIBUTED')`);
    await run(`CREATE TABLE munis_receive_payment (
      id bigint PRIMARY KEY, state int DEFAULT 1, created_at timestamp DEFAULT now(),
      status munis_receive_payment_status NOT NULL DEFAULT 'NEW', obl_id int, area_id int, real_sum numeric, pay_id bigint)`);
    // 80% — DISTRIBUTED, 10% — UPDATED, 10% — NEW (NEW hisobotga kirmaydi).
    await run(`INSERT INTO munis_receive_payment (id, created_at, status, obl_id, area_id, real_sum, pay_id)
      SELECT 8000000 + p.id, p.doc_date + (p.id % 20) * interval '1 hour',
             (CASE WHEN p.id % 100 < 80 THEN 'DISTRIBUTED' WHEN p.id % 100 < 90 THEN 'UPDATED' ELSE 'NEW' END)::munis_receive_payment_status,
             p.obl_id, p.area_id, p.asum, p.id
      FROM paydocs p WHERE p.state = 1 AND p.id % 10 = 0`);

    // ── uzasbo_send: g'aznachilikka topshiriqnomalar (serverdagi nom, tip va GIN indeks ifodasi) ──
    await run(`CREATE TYPE uzasbo_send_status AS ENUM ('CREATED', 'SENT', 'REJECTED', 'RECREATED', 'DELETED')`);
    await run(`CREATE TABLE uzasbo_send (
      id bigserial PRIMARY KEY, state int DEFAULT 1, created_at timestamp DEFAULT now(),
      obl_id int NOT NULL, area_id int, date_from date NOT NULL, date_to date NOT NULL,
      receiver_type int NOT NULL, receiver_sum numeric(18,2) NOT NULL, receiver_name varchar(70) NOT NULL,
      payment_items_id varchar, status uzasbo_send_status NOT NULL DEFAULT 'CREATED',
      uzasbo_status int, uzasbo_reason varchar, uzasbo_num int, uzasbo_treas_oper_date date, recreated bigint)`);
    // Balansda saqlovchiga — har qism alohida; qolgan kanallar — hudud × oy bo'yicha birlashtirilgan.
    // `id % 50 = 0` — belgisi bor, lekin topshiriqnomaga kirmagan ulushlar (ataylab).
    for (const c of CHANNELS) {
      const name = c.label.replace(/'/g, "''");
      if (c.key === "owner") {
        await run(`INSERT INTO uzasbo_send (obl_id, area_id, date_from, date_to, receiver_type, receiver_sum, receiver_name,
                                            payment_items_id, created_at)
          SELECT COALESCE(pi.obl_id, 0), pi.area_id, pi.doc_date, pi.doc_date, ${c.rt}, pi.${c.sum},
                 left(COALESCE(co.owner_name, '${name}'), 70), pi.id::text, pi.updated_at
          FROM payment_items pi
          LEFT JOIN LATERAL (SELECT c.owner_name FROM vw_all_contracts c WHERE c.id = pi.contract_id LIMIT 1) co ON true
          WHERE pi.${c.sent} IS TRUE AND pi.${c.sum} > 0 AND pi.id % 50 <> 0`);
      } else {
        await run(`INSERT INTO uzasbo_send (obl_id, date_from, date_to, receiver_type, receiver_sum, receiver_name,
                                            payment_items_id, created_at)
          SELECT COALESCE(pi.obl_id, 0), date_trunc('month', pi.doc_date)::date,
                 (date_trunc('month', pi.doc_date) + interval '1 month - 1 day')::date, ${c.rt}, sum(pi.${c.sum}),
                 left(COALESCE(max(l.name2), 'Respublika') || ' - ${name}', 70),
                 string_agg(pi.id::text, ', ' ORDER BY pi.id), max(pi.updated_at)
          FROM payment_items pi LEFT JOIN lists l ON l.id = pi.obl_id AND l.type_id = 1
          WHERE pi.${c.sent} IS TRUE AND pi.${c.sum} > 0 AND pi.id % 50 <> 0
          GROUP BY COALESCE(pi.obl_id, 0), date_trunc('month', pi.doc_date)`);
      }
    }
    // Ataylab TO'PLANGAN ro'yxat (serverdagidek): Namangan QQS topshiriqnomalari oldingilarning
    // qismlarini ham qayta sanaydi, summasi esa faqat o'ziniki — bu ikki marta to'lash EMAS.
    await run(`UPDATE uzasbo_send u SET payment_items_id = c.list FROM (
        SELECT a.id, string_agg(b.payment_items_id, ', ' ORDER BY b.id) AS list
        FROM uzasbo_send a JOIN uzasbo_send b ON b.receiver_type = a.receiver_type AND b.obl_id = a.obl_id AND b.id <= a.id
        WHERE a.receiver_type = 1 AND a.obl_id = 14 GROUP BY a.id) c
      WHERE c.id = u.id`);
    // Holatlar: ~86% to'langan (SENT, 4), ~2% yuborilgan-xato (42), ~6% yaratilgan, ~6% rad etilgan.
    await run(`UPDATE uzasbo_send u SET
        status = (CASE WHEN x.r < 0.88 THEN 'SENT' WHEN x.r < 0.94 THEN 'CREATED' ELSE 'REJECTED' END)::uzasbo_send_status,
        uzasbo_status = CASE WHEN x.r < 0.86 THEN 4 WHEN x.r < 0.88 THEN 42 WHEN x.r < 0.94 THEN NULL ELSE 12 END,
        uzasbo_reason = CASE WHEN x.r < 0.86 THEN '000-' WHEN x.r < 0.88 THEN 'BAD FILE' WHEN x.r < 0.94 THEN NULL
                             ELSE '187 - Счет Получателя или клиент в счете Получателя отсутствует в НИББД' END,
        uzasbo_treas_oper_date = CASE WHEN x.r < 0.86 THEN u.date_to + 1 + (x.r * 100)::int % 7 END,
        uzasbo_num = CASE WHEN x.r < 0.88 THEN (u.id % 900 + 1)::int END
      FROM (SELECT id, random() AS r FROM uzasbo_send) x WHERE x.id = u.id`);
    // Rad etilganlarning yarmi qayta yaratilib to'langan — bu IKKI MARTA to'lash EMAS.
    await run(`INSERT INTO uzasbo_send (obl_id, area_id, date_from, date_to, receiver_type, receiver_sum, receiver_name,
                                        payment_items_id, status, uzasbo_status, uzasbo_reason, uzasbo_treas_oper_date,
                                        uzasbo_num, created_at, recreated)
      SELECT obl_id, area_id, date_from, date_to, receiver_type, receiver_sum, receiver_name, payment_items_id,
             'SENT', 4, '000-', date_to + 10, (id % 900 + 1)::int, created_at + interval '3 days', id
      FROM uzasbo_send WHERE status = 'REJECTED' AND id % 2 = 0`);
    // Ataylab IKKI MARTA to'langan BS topshiriqnomalari (sahifada "N marta to'langan"); ikkita mahalliy
    // budjet nusxasi esa birlashtirilgan tur — "takroriy ro'yxat" bo'lib yashirilishi kerak.
    await run(`INSERT INTO uzasbo_send (obl_id, area_id, date_from, date_to, receiver_type, receiver_sum, receiver_name,
                                        payment_items_id, status, uzasbo_status, uzasbo_reason, uzasbo_treas_oper_date,
                                        uzasbo_num, created_at)
      SELECT obl_id, area_id, date_from, date_to, receiver_type, receiver_sum, receiver_name, payment_items_id,
             'SENT', 4, '000-', uzasbo_treas_oper_date + 30, uzasbo_num, created_at + interval '30 days'
      FROM uzasbo_send
      WHERE status = 'SENT' AND uzasbo_status = 4 AND recreated IS NULL
        AND ((receiver_type = 4 AND id % 173 = 0)
             OR id IN (SELECT id FROM uzasbo_send WHERE receiver_type = 2 AND status = 'SENT' AND uzasbo_status = 4 ORDER BY id LIMIT 2))`);
    await run(`UPDATE uzasbo_send SET state = 0, status = 'DELETED' WHERE status = 'CREATED' AND id % 10 = 0`);
    // ⚠️ String.raw — `\s` oddiy shablonda yo'qolardi. Ifoda serverdagi indeks bilan bir xil.
    await run(String.raw`CREATE INDEX idx_uzasbo_send_items_gin ON uzasbo_send USING gin
      (string_to_array(regexp_replace(payment_items_id::text, '\s+'::text, ''::text, 'g'::text), ','::text))`);

    await run("ANALYZE payment_items");
    await run("ANALYZE lists");
    await run("ANALYZE vw_all_contracts");
    await run("ANALYZE paydocs");
    await run("ANALYZE uzasbo_send");

    const [c] = await p.$queryRawUnsafe<{ n: bigint; active: bigint; docs: bigint; sends: bigint }[]>(
      `SELECT (SELECT count(*) FROM payment_items) AS n, (SELECT count(*) FROM payment_items WHERE state = 1) AS active,
              (SELECT count(*) FROM paydocs) AS docs, (SELECT count(*) FROM uzasbo_send) AS sends`,
    );
    console.log(`soxta baza tayyor: ${c.n} ta yozuv (faol ${c.active}), ${c.docs} hujjat, ${c.sends} topshiriqnoma — ${dbName}`);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error("XATO:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
