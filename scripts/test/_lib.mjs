// HTTP tekshiruvlari uchun umumiy yordamchilar (`npm run test:http`).
//
// ⚠️ Testlar DEV server (3001) va DEV bazalarga qarshi ishlaydi: `npm run dev` hamda
//    `npm run dev:setup` + `npm run dev:stub` bajarilgan bo'lishi kerak.
// ⚠️ `project` (soxta baza) — faqat READ ONLY tranzaksiyada o'qiladi.
// ⚠️ JWT, parol va .env qiymatlari hech qayerga chiqarilmaydi.
import "dotenv/config";
import pc from "@prisma/client";
import { encode } from "@auth/core/jwt";
import ExcelJS from "exceljs";

export const BASE = process.env.TEST_BASE ?? "http://localhost:3001";

export const db = new pc.PrismaClient();
export const proj = new pc.PrismaClient({ datasourceUrl: process.env.PROJECT_DATABASE_URL });

/** Faqat o'qish tranzaksiyasida xom SQL (ilovaning o'zi kabi). */
export const ro = (sql) =>
  proj.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.$queryRawUnsafe(sql);
  });

export const get = (path, cookie = "") => fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
export const isRedirTo = (r, p) => [303, 307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes(p);

/** HTML'ni solishtirishga tayyorlash: React izohlari va BARCHA bo'shliqlar olib tashlanadi. */
export const norm = (h) => h.replace(/<!-- -->/g, "").replace(/[\s  ]/g, "");
export const unesc = (h) => h.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

// Sahifadagi formatlash bilan BIR XIL (`lib/format.ts`), bo'shliqlarsiz.
export const nf = (n, d = 0) => n.toLocaleString("uz-UZ", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\s  ]/g, "");
export const sum = (n) => nf(Math.round(n));
export const mln = (n) => {
  const v = Math.round(n / 1e5) / 10;
  return nf(v === 0 ? 0 : v, 1);
};

/** Sarlavhasi `label` bo'lgan BIRINCHI jadval qatori kataklari (ichidagi teglarsiz). */
export function rowCells(html, label) {
  const row = norm(html)
    .split("</tr>")
    .find((seg) => seg.includes(`>${label}</a>`) || seg.includes(`>${label}</td>`) || seg.includes(`>${label}<span`));
  return [...(row ?? "").matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
}

export async function xlsx(res) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return wb;
}

/** Test foydalanuvchisi (nomi `test-` bilan boshlanadi — oxirida o'chiriladi) va uning cookie'si. */
export async function cookieFor(username, role, regionId = null) {
  const u = await db.user.upsert({
    where: { username },
    update: { role, regionId, isActive: true },
    create: { username, fullName: username, passwordHash: "!", role, regionId },
  });
  return `payments.session-token=${await encode({
    token: { sub: u.id, name: u.fullName, role: u.role, username: u.username, sessionVersion: u.sessionVersion },
    secret: process.env.NEXTAUTH_SECRET,
    salt: "payments.session-token",
    maxAge: 3600,
  })}`;
}

/** Bitta to'plam natijalari: `t.check(...)` → oxirida `t.lines` va `t.failed`. */
export function suite(name) {
  const lines = [];
  return {
    name,
    lines,
    get failed() {
      return lines.filter((l) => !l.startsWith("OK")).length;
    },
    check(title, ok, info = "") {
      lines.push(`${ok ? "OK  " : "FAIL"} ${title}${info ? " — " + info : ""}`);
    },
    error(e) {
      lines.push("XATO: " + (e instanceof Error ? e.message.split("\n")[0] : String(e)));
    },
  };
}

/** 12 kanal — `lib/channels.ts` bilan BIR XIL (kalit, summa, tasdiq, belgi, topshiriqnoma turi). */
export const CHANNELS = [
  ["vat", "vat_sum", "vat_accept", "sent_vat", 1],
  ["mahalliy", "mahalliy_sum", "mahalliy_accept", "sent_mahalliy", 2],
  ["owner", "owner_sum", "owner_accept", "sent_owner", 4],
  ["center", "center_sum", "center_accept", "sent_center", 5],
  ["madaniy", "madaniy_sum", "madaniy_accept", "sent_madaniy", 3],
  ["sport", "sport_sum", "sport_accept", "sent_sport", 6],
  ["defence", "defense_sum", "defence_accept", "sent_defence", 7],
  ["eco", "eco_sum", "eco_accept", "sent_eco", 11],
  ["medicine", "medicine_sum", "medicine_accept", "sent_medicine", 12],
  ["penya", "penya_sum", "penya_accept", "sent_penya", 8],
  ["jarima", "jarima_sum", "jarima_accept", "sent_jarima", 9],
  ["mail", "mail_sum", "mail_accept", "sent_mail", 10],
];

// `uzasbo_send` SQL bo'laklari — `server/services/uzasboSql.ts` bilan bir xil ma'noda.
export const ITEMS_ARR = String.raw`string_to_array(regexp_replace(u.payment_items_id, '\s+', '', 'g'), ',')`;
export const PAID = "u.state = 1 AND u.status = 'SENT' AND u.uzasbo_status = 4";
export const PAID_CTE = `paid AS (SELECT e::bigint AS item, bit_or(1 << u.receiver_type) AS mask
  FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_ARR}) AS e
  WHERE ${PAID} AND e ~ '^[0-9]{1,18}$' GROUP BY 1)`;
export const paidBit = (rt) => `(COALESCE(pd.mask, 0) & ${1 << rt}) <> 0`;

export const DEFAULT_FROM = "2025-05-13";
export const today = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tashkent" }).slice(0, 10);

export async function cleanup(prefix) {
  await db.auditLog.deleteMany({ where: { user: { username: { startsWith: prefix } } } }).catch(() => {});
  await db.user.deleteMany({ where: { username: { startsWith: prefix } } }).catch(() => {});
}

export async function disconnect() {
  await db.$disconnect();
  await proj.$disconnect();
}
