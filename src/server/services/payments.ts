import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";
import { readOnly } from "@/lib/projectDb";
import { CHANNELS, channelByKey, type Channel, type Holat } from "@/lib/channels";
import { regionRank } from "@/lib/regions";

/**
 * To'lovlar taqsimoti — `project.payment_items` ustidan barcha so'rovlar SHU YERDA.
 *
 * ⚠️ Faqat `state = 1` (foydalanuvchi qarori, 2026-09-11). Jonli bazada `state = 0`
 * 176 996 ta (~487 mlrd) — ular hisobotga kirmaydi.
 * ⚠️ Har bir so'rov `readOnly()` ichida (READ ONLY tranzaksiya + statement_timeout).
 * ⚠️ Ustun nomlari faqat `CHANNELS` ro'yxatidan `Prisma.raw` bilan; qiymatlar esa
 * doim parametr (`Prisma.sql`) — foydalanuvchi kiritgani SQL matniga tushmaydi.
 */

export const PAYMENTS_CACHE_TAG = "payments";

export interface PaymentFilters {
  /** To'lov sanasi (`doc_date`) oralig'i, YYYY-MM-DD, ikkala chegara ham QO'SHIB. */
  from?: string;
  to?: string;
  /** `lists.type_id = 1` id (hudud). */
  obl?: number;
  /** `lists.type_id = 2` id (tuman). */
  area?: number;
}

export const METRIC_KEYS = ["jami", "tasdiqlangan", "otkazilgan", "otkazilmagan", "tasdiqlanmagan", "anomaliya"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export interface Metric {
  n: number;
  s: number;
}
export type Metrics = Record<MetricKey, Metric>;

/** O'tkazilmagan summaning "yoshi" — to'lov sanasidan (`doc_date`) bugungacha. */
export const AGE_BUCKETS = [
  { key: "a30", label: "0–30 kun", sql: "<= 30" },
  { key: "a90", label: "31–90 kun", sql: "BETWEEN 31 AND 90" },
  { key: "a180", label: "91–180 kun", sql: "BETWEEN 91 AND 180" },
  { key: "a365", label: "181–365 kun", sql: "BETWEEN 181 AND 365" },
  { key: "aOld", label: "1 yildan ko'p", sql: "> 365" },
] as const;
export type AgeKey = (typeof AGE_BUCKETS)[number]["key"];

type Row = Record<string, unknown>;

// ── Yordamchilar ────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v); // bigint va Prisma.Decimal ikkalasi ham to'g'ri o'giriladi
  return Number.isFinite(n) ? n : 0;
}

/** `date` ustuni → "YYYY-MM-DD". Prisma uni UTC yarim tunidagi `Date` qilib beradi. */
function isoDate(v: unknown): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null;
}

/**
 * `timestamp WITHOUT time zone` → "YYYY-MM-DD HH:mm:ss" (devor soati, o'zgarishsiz).
 * ⚠️ Prisma bunday qiymatni UTC deb o'qiydi — ISO satrning o'zi aynan bazadagi vaqt.
 */
function isoTs(v: unknown): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 19).replace("T", " ") : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Ustun nomi — FAQAT `CHANNELS` dan keladigan qiymat bilan chaqiring. */
function col(name: string): Prisma.Sql {
  return Prisma.raw(`pi.${name}`);
}

function mustChannel(key: string): Channel {
  const ch = channelByKey(key);
  if (!ch) throw new Error(`Noma'lum kanal: ${key}`);
  return ch;
}

function metricConds(ch: Channel): Record<MetricKey, Prisma.Sql> {
  const S = col(ch.sum);
  const A = col(ch.accept);
  const T = col(ch.sent);
  // ⚠️ `IS TRUE` / `IS NOT TRUE` — NULL ham "yo'q" hisoblanadi (`= true` NULL'ni tashlab ketardi).
  return {
    jami: Prisma.sql`${S} > 0`,
    tasdiqlangan: Prisma.sql`${S} > 0 AND ${A} IS TRUE`,
    otkazilgan: Prisma.sql`${S} > 0 AND ${T} IS TRUE`,
    otkazilmagan: Prisma.sql`${S} > 0 AND ${A} IS TRUE AND ${T} IS NOT TRUE`,
    tasdiqlanmagan: Prisma.sql`${S} > 0 AND ${A} IS NOT TRUE AND ${T} IS NOT TRUE`,
    anomaliya: Prisma.sql`${S} > 0 AND ${T} IS TRUE AND ${A} IS NOT TRUE`,
  };
}

/**
 * Faol shartnoma sharti — foydalanuvchi SQL'idagi JOIN sharti bilan bir xil
 * (`co.state = 1 AND co.doc_status = 3`).
 *
 * ⚠️ `JOIN` EMAS, `EXISTS`: `vw_all_contracts` — ko'rinish, unda bitta `id` bir
 * necha marta uchrasa JOIN qatorni ko'paytirib, SUMMALARNI jimgina oshirib yuborardi.
 * EXISTS esa qatorni hech qachon ko'paytirmaydi.
 */
const ACTIVE_CONTRACT = Prisma.sql`c.id = pi.contract_id AND c.state = 1 AND c.doc_status = 3`;
const NO_REQUISITES = Prisma.sql`(NULLIF(btrim(c.owner_account), '') IS NULL OR NULLIF(btrim(c.owner_mfo), '') IS NULL)`;

export function holatCond(ch: Channel, h: Holat): Prisma.Sql {
  const m = metricConds(ch);
  switch (h) {
    case "shartnomasiz":
      return Prisma.sql`${m.otkazilmagan} AND NOT EXISTS (SELECT 1 FROM vw_all_contracts c WHERE ${ACTIVE_CONTRACT})`;
    case "rekvizitsiz":
      return Prisma.sql`${m.otkazilmagan} AND EXISTS (SELECT 1 FROM vw_all_contracts c WHERE ${ACTIVE_CONTRACT} AND ${NO_REQUISITES})`;
    default:
      return m[h];
  }
}

function filterConds(f: PaymentFilters): Prisma.Sql[] {
  const c: Prisma.Sql[] = [Prisma.sql`pi.state = 1`];
  if (f.from) c.push(Prisma.sql`pi.doc_date >= ${f.from}::date`);
  if (f.to) c.push(Prisma.sql`pi.doc_date <= ${f.to}::date`);
  if (f.obl !== undefined) c.push(Prisma.sql`pi.obl_id = ${f.obl}::int`);
  if (f.area !== undefined) c.push(Prisma.sql`pi.area_id = ${f.area}::int`);
  return c;
}

/**
 * Qidiruv: raqam bo'lsa — biriktirish ID, to'lov ID, BS STIR yoki shartnoma raqami
 * (aniq); matn bo'lsa — shartnoma raqami (qism bo'yicha).
 */
function qCond(q: string): Prisma.Sql {
  const t = q.trim();
  if (/^\d{1,18}$/.test(t)) {
    return Prisma.sql`(pi.id = ${t}::bigint OR pi.pay_id = ${t}::bigint OR pi.owner_tin = ${t}::bigint
      OR EXISTS (SELECT 1 FROM vw_all_contracts c WHERE ${ACTIVE_CONTRACT}
                 AND (c.owner_tin = ${t}::bigint OR c.new_contract_number = ${t})))`;
  }
  const like = `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return Prisma.sql`EXISTS (SELECT 1 FROM vw_all_contracts c WHERE ${ACTIVE_CONTRACT} AND c.new_contract_number ILIKE ${like})`;
}

const whereSql = (conds: Prisma.Sql[]) => Prisma.join(conds, " AND ");

/** Oltita ko'rsatkich (soni + summasi) — `prefix` bilan nomlangan ustunlar. */
function metricSelect(ch: Channel, prefix: string): Prisma.Sql {
  const S = col(ch.sum);
  const conds = metricConds(ch);
  return Prisma.join(
    METRIC_KEYS.map(
      (k) =>
        Prisma.sql`count(*) FILTER (WHERE ${conds[k]}) AS ${Prisma.raw(`"${prefix}${k}_n"`)},
                   COALESCE(sum(${S}) FILTER (WHERE ${conds[k]}), 0) AS ${Prisma.raw(`"${prefix}${k}_s"`)}`,
    ),
    ", ",
  );
}

function readMetrics(r: Row, prefix: string): Metrics {
  const out = {} as Metrics;
  for (const k of METRIC_KEYS) out[k] = { n: toNum(r[`${prefix}${k}_n`]), s: toNum(r[`${prefix}${k}_s`]) };
  return out;
}

export function emptyMetrics(): Metrics {
  const out = {} as Metrics;
  for (const k of METRIC_KEYS) out[k] = { n: 0, s: 0 };
  return out;
}

export function addMetrics(a: Metrics, b: Metrics): Metrics {
  const out = {} as Metrics;
  for (const k of METRIC_KEYS) out[k] = { n: a[k].n + b[k].n, s: a[k].s + b[k].s };
  return out;
}

const cacheOpts = () => ({ revalidate: env.CACHE_SECONDS, tags: [PAYMENTS_CACHE_TAG] });

// ── Umumiy ko'rinish: 12 kanal matritsasi ────────────────────────────────────

export interface ChannelMatrix {
  total: Metric;
  /** Filtr doirasidagi eng so'nggi biriktirish vaqti (ma'lumot yangiligi). */
  lastCreated: string | null;
  channels: { key: string; label: string; m: Metrics }[];
}

/** BITTA jadval skanida 12 kanal × 6 ko'rsatkich. */
async function computeMatrix(f: PaymentFilters): Promise<ChannelMatrix> {
  const selects = CHANNELS.map((ch) => metricSelect(ch, `${ch.key}__`));
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT count(*) AS total_n, COALESCE(sum(pi.asum), 0) AS total_s, max(pi.created_at) AS last_created,
             ${Prisma.join(selects, ", ")}
      FROM payment_items pi
      WHERE ${whereSql(filterConds(f))}`),
  );
  const r = rows[0] ?? {};
  return {
    total: { n: toNum(r.total_n), s: toNum(r.total_s) },
    lastCreated: isoTs(r.last_created),
    channels: CHANNELS.map((ch) => ({ key: ch.key, label: ch.label, m: readMetrics(r, `${ch.key}__`) })),
  };
}

export const getChannelMatrix = (f: PaymentFilters) =>
  unstable_cache(computeMatrix, ["pay-matrix-v1"], cacheOpts())(f);

// ── Kanal: hududlar kesimi + qarz yoshi ─────────────────────────────────────

export interface GroupRow {
  id: number | null;
  name: string;
  m: Metrics;
  aging: Record<AgeKey, number>;
}

function ageSelect(ch: Channel): Prisma.Sql {
  const S = col(ch.sum);
  const otk = metricConds(ch).otkazilmagan;
  return Prisma.join(
    AGE_BUCKETS.map(
      (b) =>
        Prisma.sql`COALESCE(sum(${S}) FILTER (WHERE ${otk} AND (current_date - pi.doc_date) ${Prisma.raw(b.sql)}), 0)
                   AS ${Prisma.raw(`"age_${b.key}"`)}`,
    ),
    ", ",
  );
}

function readGroup(r: Row, fallbackName: string): GroupRow {
  const aging = {} as Record<AgeKey, number>;
  for (const b of AGE_BUCKETS) aging[b.key] = toNum(r[`age_${b.key}`]);
  const id = r.id === null || r.id === undefined ? null : Number(r.id);
  return { id, name: str(r.name) ?? fallbackName, m: readMetrics(r, ""), aging };
}

async function computeByRegion(key: string, f: PaymentFilters): Promise<GroupRow[]> {
  const ch = mustChannel(key);
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT pi.obl_id AS id, max(l.name2) AS name, ${metricSelect(ch, "")}, ${ageSelect(ch)}
      FROM payment_items pi
      LEFT JOIN lists l ON l.id = pi.obl_id AND l.type_id = 1
      WHERE ${whereSql([...filterConds(f), Prisma.sql`${col(ch.sum)} > 0`])}
      GROUP BY pi.obl_id`),
  );
  return rows
    .map((r) => readGroup(r, "Hudud ko'rsatilmagan"))
    .sort((a, b) => regionRank(a.id) - regionRank(b.id));
}

export const getByRegion = (key: string, f: PaymentFilters) =>
  unstable_cache(computeByRegion, ["pay-region-v1"], cacheOpts())(key, f);

async function computeByDistrict(key: string, f: PaymentFilters): Promise<GroupRow[]> {
  const ch = mustChannel(key);
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT pi.area_id AS id, max(l2.name2) AS name, ${metricSelect(ch, "")}, ${ageSelect(ch)}
      FROM payment_items pi
      LEFT JOIN lists l2 ON l2.id = pi.area_id AND l2.type_id = 2
      WHERE ${whereSql([...filterConds(f), Prisma.sql`${col(ch.sum)} > 0`])}
      GROUP BY pi.area_id`),
  );
  return rows.map((r) => readGroup(r, "Tuman ko'rsatilmagan")).sort((a, b) => a.name.localeCompare(b.name, "uz"));
}

export const getByDistrict = (key: string, f: PaymentFilters) =>
  unstable_cache(computeByDistrict, ["pay-district-v1"], cacheOpts())(key, f);

/**
 * O'tkazilmagan ulushlar ichidagi shartnoma muammolari.
 * ⚠️ Eng og'ir so'rov (ko'rinishga murojaat) — sahifa uni ALOHIDA kutadi, u sekin
 * yoki xato bo'lsa qolgan jadvallar baribir ko'rinadi.
 */
export interface ContractIssues {
  shartnomasiz: Metric;
  rekvizitsiz: Metric;
}

async function computeContractIssues(key: string, f: PaymentFilters): Promise<ContractIssues> {
  const ch = mustChannel(key);
  const S = col(ch.sum);
  const noContract = Prisma.sql`NOT EXISTS (SELECT 1 FROM vw_all_contracts c WHERE ${ACTIVE_CONTRACT})`;
  const noReq = Prisma.sql`EXISTS (SELECT 1 FROM vw_all_contracts c WHERE ${ACTIVE_CONTRACT} AND ${NO_REQUISITES})`;
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT count(*) FILTER (WHERE ${noContract}) AS nc_n, COALESCE(sum(${S}) FILTER (WHERE ${noContract}), 0) AS nc_s,
             count(*) FILTER (WHERE ${noReq}) AS nr_n, COALESCE(sum(${S}) FILTER (WHERE ${noReq}), 0) AS nr_s
      FROM payment_items pi
      WHERE ${whereSql([...filterConds(f), metricConds(ch).otkazilmagan])}`),
  );
  const r = rows[0] ?? {};
  return {
    shartnomasiz: { n: toNum(r.nc_n), s: toNum(r.nc_s) },
    rekvizitsiz: { n: toNum(r.nr_n), s: toNum(r.nr_s) },
  };
}

export const getContractIssues = (key: string, f: PaymentFilters) =>
  unstable_cache(computeContractIssues, ["pay-issues-v1"], cacheOpts())(key, f);

// ── Ma'lumotnomalar ─────────────────────────────────────────────────────────

export interface Option {
  id: number;
  name: string;
}

async function computeRegions(): Promise<Option[]> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`SELECT id, name2 AS name FROM lists WHERE type_id = 1`),
  );
  return rows
    .map((r) => ({ id: Number(r.id), name: str(r.name) ?? String(r.id) }))
    .sort((a, b) => regionRank(a.id) - regionRank(b.id));
}

export const getRegions = () =>
  unstable_cache(computeRegions, ["pay-regions-v1"], { revalidate: 3600, tags: [PAYMENTS_CACHE_TAG] })();

/** Hududdagi tumanlar — faqat to'lovlarda haqiqatan uchraydiganlari. */
async function computeDistricts(obl: number): Promise<Option[]> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT pi.area_id AS id, max(l2.name2) AS name
      FROM payment_items pi
      LEFT JOIN lists l2 ON l2.id = pi.area_id AND l2.type_id = 2
      WHERE pi.state = 1 AND pi.obl_id = ${obl}::int AND pi.area_id IS NOT NULL
      GROUP BY pi.area_id`),
  );
  return rows
    .map((r) => ({ id: Number(r.id), name: str(r.name) ?? `#${r.id}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "uz"));
}

export const getDistricts = (obl: number) =>
  unstable_cache(computeDistricts, ["pay-districts-v1"], { revalidate: 3600, tags: [PAYMENTS_CACHE_TAG] })(obl);

// ── Ro'yxat va eksport ──────────────────────────────────────────────────────

export interface PaymentRow {
  id: string;
  payId: string | null;
  docDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  asum: number;
  share: number;
  accepted: boolean | null;
  sent: boolean | null;
  region: string | null;
  district: string | null;
  hasContract: boolean;
  contractNumber: string | null;
  ownerTin: string | null;
  ownerName: string | null;
  ownerMfo: string | null;
  ownerAccount: string | null;
}

export function rowHolatLabel(r: Pick<PaymentRow, "accepted" | "sent">): string {
  if (r.sent === true) return r.accepted === true ? "O'tkazilgan" : "Tasdiqlanmasdan o'tkazilgan";
  return r.accepted === true ? "O'tkazilmagan" : "Tasdiqlanmagan";
}

/**
 * Berilgan id'lar uchun to'liq qatorlar (tartib saqlanadi).
 * ⚠️ Shartnoma `LATERAL … LIMIT 1` bilan — dublikat bo'lsa ham qator ko'paymaydi.
 * Ko'rinishga faqat shu (≤ bo'lak hajmi) qatorlar uchun murojaat qilinadi.
 */
async function detailRows(tx: Prisma.TransactionClient, ch: Channel, ids: string[]): Promise<PaymentRow[]> {
  if (ids.length === 0) return [];
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    SELECT pi.id, pi.pay_id, pi.doc_date, pi.created_at, pi.updated_at, pi.asum,
           ${col(ch.sum)} AS share, ${col(ch.accept)} AS accepted, ${col(ch.sent)} AS sent,
           l.name2 AS region, l2.name2 AS district,
           co.id AS contract_id, co.new_contract_number, co.owner_tin, co.owner_name, co.owner_mfo, co.owner_account
    FROM payment_items pi
    LEFT JOIN lists l ON l.id = pi.obl_id AND l.type_id = 1
    LEFT JOIN lists l2 ON l2.id = pi.area_id AND l2.type_id = 2
    LEFT JOIN LATERAL (
      SELECT c.id, c.new_contract_number, c.owner_tin, c.owner_name, c.owner_mfo, c.owner_account
      FROM vw_all_contracts c WHERE ${ACTIVE_CONTRACT} LIMIT 1
    ) co ON true
    WHERE pi.id = ANY(${ids}::bigint[])`);

  const byId = new Map(
    rows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        payId: str(r.pay_id),
        docDate: isoDate(r.doc_date),
        createdAt: isoTs(r.created_at),
        updatedAt: isoTs(r.updated_at),
        asum: toNum(r.asum),
        share: toNum(r.share),
        accepted: typeof r.accepted === "boolean" ? r.accepted : null,
        sent: typeof r.sent === "boolean" ? r.sent : null,
        region: str(r.region),
        district: str(r.district),
        hasContract: r.contract_id !== null && r.contract_id !== undefined,
        contractNumber: str(r.new_contract_number),
        ownerTin: str(r.owner_tin),
        ownerName: str(r.owner_name),
        ownerMfo: str(r.owner_mfo),
        ownerAccount: str(r.owner_account),
      } satisfies PaymentRow,
    ]),
  );
  return ids.map((id) => byId.get(id)).filter((r): r is PaymentRow => Boolean(r));
}

export interface Selection {
  channel: string;
  holat: Holat;
  f: PaymentFilters;
  q?: string;
}

function selectionConds(sel: Selection): { ch: Channel; conds: Prisma.Sql[] } {
  const ch = mustChannel(sel.channel);
  const conds = [...filterConds(sel.f), holatCond(ch, sel.holat)];
  if (sel.q) conds.push(qCond(sel.q));
  return { ch, conds };
}

export interface SelectionSummary {
  n: number;
  /** Kanal ulushlari yig'indisi. */
  s: number;
  /** To'lovlarning to'liq summasi (`asum`). */
  asum: number;
}

export async function selectionSummary(sel: Selection): Promise<SelectionSummary> {
  const { ch, conds } = selectionConds(sel);
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT count(*) AS n, COALESCE(sum(${col(ch.sum)}), 0) AS s, COALESCE(sum(pi.asum), 0) AS a
      FROM payment_items pi WHERE ${whereSql(conds)}`),
  );
  const r = rows[0] ?? {};
  return { n: toNum(r.n), s: toNum(r.s), asum: toNum(r.a) };
}

export const PAGE_SIZE = 50;

export async function listPayments(sel: Selection, page: number): Promise<{ summary: SelectionSummary; rows: PaymentRow[]; page: number; pages: number }> {
  const { ch, conds } = selectionConds(sel);
  return readOnly(async (tx) => {
    const [agg] = await tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT count(*) AS n, COALESCE(sum(${col(ch.sum)}), 0) AS s, COALESCE(sum(pi.asum), 0) AS a
      FROM payment_items pi WHERE ${whereSql(conds)}`);
    const summary = { n: toNum(agg?.n), s: toNum(agg?.s), asum: toNum(agg?.a) };
    const pages = Math.max(1, Math.ceil(summary.n / PAGE_SIZE));
    const p = Math.min(Math.max(1, page), pages);
    // ⚠️ Avval faqat id'lar (ko'rinishga murojaatsiz), keyin 50 ta qator uchun tafsilot.
    const idRows = await tx.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      SELECT pi.id FROM payment_items pi WHERE ${whereSql(conds)}
      ORDER BY pi.doc_date DESC, pi.id DESC
      LIMIT ${PAGE_SIZE}::int OFFSET ${(p - 1) * PAGE_SIZE}::int`);
    const rows = await detailRows(tx, ch, idRows.map((r) => String(r.id)));
    return { summary, rows, page: p, pages };
  });
}

/**
 * Eksport uchun bo'lak-bo'lak o'qish — butun natija xotiraga yig'ilmaydi.
 * ⚠️ Kalit bo'yicha (`pi.id >`), OFFSET emas: chuqur OFFSET har bo'lakda boshidan
 * sanab chiqadi va 300 000 qatorda kvadratik sekinlashardi.
 */
export async function* exportChunks(sel: Selection, chunk = 5000): AsyncGenerator<PaymentRow[]> {
  const { ch, conds } = selectionConds(sel);
  let last: string | null = null;
  for (;;) {
    const after: string | null = last;
    const rows: PaymentRow[] = await readOnly(async (tx) => {
      const c = after === null ? conds : [...conds, Prisma.sql`pi.id > ${after}::bigint`];
      const ids = await tx.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        SELECT pi.id FROM payment_items pi WHERE ${whereSql(c)} ORDER BY pi.id LIMIT ${chunk}::int`);
      return detailRows(tx, ch, ids.map((r) => String(r.id)));
    });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < chunk) return;
    last = rows[rows.length - 1].id;
  }
}
