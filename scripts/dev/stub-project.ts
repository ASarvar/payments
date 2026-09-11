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
 *   - `sent_*` da `false` ham, `NULL` ham.
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
             b.id * 7 + 100000, b.doc, 200000000 + (b.cid % 700),
             ${insertVals.join(", ")}
      FROM (
        SELECT g AS id,
               (ARRAY[35,3,6,8,10,12,14,18,22,24,27,30,33,26,0])[1 + (g % 15)] AS obl,
               1 + ((g::bigint * 31) % 8400) AS cid,
               round((random() * 9900000 + 100000)::numeric, 2) AS asum,
               CASE WHEN random() < 0.9 THEN 1 ELSE 0 END AS state,
               date '2023-08-01' + (random() * (current_date - date '2023-08-01'))::int AS doc
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
    await run("ANALYZE payment_items");
    await run("ANALYZE lists");
    await run("ANALYZE vw_all_contracts");

    const [c] = await p.$queryRawUnsafe<{ n: bigint; active: bigint }[]>(
      "SELECT count(*) AS n, count(*) FILTER (WHERE state = 1) AS active FROM payment_items",
    );
    console.log(`soxta baza tayyor: ${c.n} ta yozuv (faol ${c.active}), ${dbName}`);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error("XATO:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
