import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { readOnly } from "@/lib/projectDb";
import { shiftDate } from "@/lib/format";
import { PAGE_SIZE, getRegions, type PaymentFilters } from "@/server/services/payments";
import { isoDate, str, toNum, type Row } from "@/server/services/sqlUtil";
import { cacheOpts, whereSql } from "./shared";

export const BIR_TYPES = [
  { key: "rent", col: "rent_sum", label: "Ijara" },
  { key: "penya", col: "penya_sum", label: "Penya" },
  { key: "tax", col: "tax_sum", label: "Davlat boji" },
  { key: "mail", col: "mail_sum", label: "Pochta" },
  { key: "fine", col: "fine_sum", label: "Jarima" },
  { key: "advance", col: "advance_sum", label: "Oldindan to'lov" },
  { key: "unknown", col: "unknown_sum", label: "Aniqlanmagan" },
  { key: "returned", col: "returned_sum", label: "Qaytgan (bal. saqlovchidan)" },
  { key: "returned2", col: "returned_sum2", label: "Qaytarilgan (ijarachiga)" },
  { key: "other", col: "other_sum", label: "Boshqa" },
] as const;
export type BirType = (typeof BIR_TYPES)[number]["key"];

export interface BirAmounts {
  tushum: number;
  biriktirilgan: number;
  farq: number;
}

export interface BirRow extends BirAmounts {
  id: number | null;
  name: string;
  day: BirAmounts;
  munis: number;
  types: Record<BirType, number>;
}

function birRow(id: number | null, name: string, r: Row): BirRow {
  const parsing = toNum(r.parsing);
  const munis = toNum(r.munis);
  const tushum = toNum(r.asum);
  const dayT = toNum(r.asum_day);
  const dayB = toNum(r.parsing_day) + toNum(r.munis_day);
  const types = {} as Record<BirType, number>;
  for (const t of BIR_TYPES) types[t.key] = toNum(r[t.key]);
  return {
    id,
    name,
    tushum,
    biriktirilgan: parsing + munis,
    farq: tushum - parsing - munis,
    day: { tushum: dayT, biriktirilgan: dayB, farq: dayT - dayB },
    munis,
    types,
  };
}

const BIR_TYPE_SUMS = Prisma.raw(BIR_TYPES.map((t) => `sum(${t.col}) AS "${t.key}"`).join(", "));

async function computeBiriktirish(from: string | undefined, to: string, obl?: number): Promise<BirRow[]> {
  const scope = (col: string) =>
    Prisma.sql`${from ? Prisma.sql`AND ${Prisma.raw(col)} >= ${from}::date` : Prisma.empty}
               ${obl !== undefined ? Prisma.sql`AND obl_id = ${obl}::int` : Prisma.empty}`;
  const typeCols = Prisma.raw(BIR_TYPES.map((t) => `p."${t.key}"`).join(", "));
  const [rows, regions] = await Promise.all([
    readOnly((tx) =>
      tx.$queryRaw<Row[]>(Prisma.sql`
        WITH d AS (
          SELECT obl_id, sum(asum) AS asum, sum(asum) FILTER (WHERE doc_date = ${to}::date) AS asum_day
          FROM paydocs WHERE state = 1 AND doc_date <= ${to}::date ${scope("doc_date")}
          GROUP BY obl_id
        ), p AS (
          SELECT obl_id, sum(parsing_sum) AS parsing,
                 sum(parsing_sum) FILTER (WHERE doc_date = ${to}::date) AS parsing_day, ${BIR_TYPE_SUMS}
          FROM payments WHERE state = 1 AND doc_date <= ${to}::date ${scope("doc_date")}
          GROUP BY obl_id
        ), m AS (
          SELECT obl_id, sum(real_sum) AS munis, sum(real_sum) FILTER (WHERE created_at >= ${to}::date) AS munis_day
          FROM munis_receive_payment
          WHERE state = 1 AND status > 'NEW'::munis_receive_payment_status
            AND created_at < ${to}::date + 1 ${scope("created_at")}
          GROUP BY obl_id
        ), k AS (SELECT obl_id FROM d UNION SELECT obl_id FROM p UNION SELECT obl_id FROM m)
        SELECT k.obl_id, d.asum, d.asum_day, p.parsing, p.parsing_day, ${typeCols}, m.munis, m.munis_day
        FROM k LEFT JOIN d USING (obl_id) LEFT JOIN p USING (obl_id) LEFT JOIN m USING (obl_id)`),
    ),
    getRegions(),
  ]);
  const byObl = new Map(rows.map((r) => [Number(r.obl_id), r]));
  return regions
    .filter((reg) => reg.id > 0 && (obl === undefined || reg.id === obl))
    .map((reg) => birRow(reg.id, reg.name, byObl.get(reg.id) ?? {}));
}

export const getBiriktirish = (from: string | undefined, to: string, obl?: number) =>
  unstable_cache(computeBiriktirish, ["taq-bir-v2"], cacheOpts())(from, to, obl);

export interface BirPeriod {
  key: "davr" | "oy" | "kecha" | "bugun";
  label: string;
  from?: string;
  to: string;
}

export function birPeriods(from: string | undefined, to: string, today: string): BirPeriod[] {
  const prev = shiftDate(to, -1);
  const isToday = to === today;
  return [
    { key: "davr", label: "Hisobot davrida", from, to },
    { key: "oy", label: "Joriy oy", from: `${to.slice(0, 7)}-01`, to },
    { key: "kecha", label: isToday ? "Kecha" : "Oldingi kun", from: prev, to: prev },
    { key: "bugun", label: isToday ? "Bugun" : "Oxirgi kun", from: to, to },
  ];
}

export const BIR_DOC_HOLATLAR = [
  { key: "hammasi", label: "Hammasi" },
  { key: "biriktirilmagan", label: "Biriktirilmagan qoldig'i bor" },
  { key: "toliq", label: "To'liq biriktirilgan" },
  { key: "ortiqcha", label: "Ortiqcha biriktirilgan" },
] as const;
export type BirDocHolat = (typeof BIR_DOC_HOLATLAR)[number]["key"];

export const isBirDocHolat = (v: string | undefined): v is BirDocHolat => BIR_DOC_HOLATLAR.some((h) => h.key === v);
export const isBirType = (v: string | undefined): v is BirType => BIR_TYPES.some((t) => t.key === v);

const DOC_HOLAT_COND: Record<BirDocHolat, Prisma.Sql | null> = {
  hammasi: null,
  biriktirilmagan: Prisma.sql`x.asum - x.bir > 0.005`,
  toliq: Prisma.sql`abs(x.asum - x.bir) <= 0.005`,
  ortiqcha: Prisma.sql`x.asum - x.bir < -0.005`,
};

export interface BirDocSel {
  obl: number;
  from?: string;
  to: string;
  holat: BirDocHolat;
  tur?: BirType;
}

export interface BirDoc extends BirAmounts {
  id: string;
  docDate: string | null;
  docNum: string | null;
  payer: string | null;
  note: string | null;
  munis: number;
  types: Record<BirType, number>;
}

export interface BirDocSummary extends BirAmounts {
  n: number;
  munis: number;
  types: Record<BirType, number>;
}

function birDocQuery(sel: BirDocSel): { cte: Prisma.Sql; where: Prisma.Sql } {
  const typeX = Prisma.raw(BIR_TYPES.map((t) => `COALESCE(pa."${t.key}", 0) AS "${t.key}"`).join(", "));
  const cte = Prisma.sql`
    WITH d AS (
      SELECT p.id, p.doc_date, p.doc_num, p.asum, p.cl_name, p.anote
      FROM paydocs p
      WHERE p.state = 1 AND p.obl_id = ${sel.obl}::int AND p.doc_date <= ${sel.to}::date
        ${sel.from ? Prisma.sql`AND p.doc_date >= ${sel.from}::date` : Prisma.empty}
    ), pa AS (
      SELECT pay_id, sum(parsing_sum) AS parsing, ${BIR_TYPE_SUMS}
      FROM payments WHERE state = 1 AND pay_id IN (SELECT id FROM d) GROUP BY pay_id
    ), mu AS (
      SELECT pay_id, sum(real_sum) AS munis
      FROM munis_receive_payment
      WHERE state = 1 AND status > 'NEW'::munis_receive_payment_status AND pay_id IN (SELECT id FROM d)
      GROUP BY pay_id
    ), x AS (
      SELECT d.*, COALESCE(pa.parsing, 0) + COALESCE(mu.munis, 0) AS bir, COALESCE(mu.munis, 0) AS munis, ${typeX}
      FROM d LEFT JOIN pa ON pa.pay_id = d.id LEFT JOIN mu ON mu.pay_id = d.id
    )`;
  const conds: Prisma.Sql[] = [Prisma.sql`true`];
  const h = DOC_HOLAT_COND[sel.holat];
  if (h) conds.push(h);
  if (sel.tur) conds.push(Prisma.raw(`x."${sel.tur}" > 0`));
  return { cte, where: whereSql(conds) };
}

function birTypes(r: Row): Record<BirType, number> {
  const types = {} as Record<BirType, number>;
  for (const t of BIR_TYPES) types[t.key] = toNum(r[t.key]);
  return types;
}

async function computeBirDocSummary(sel: BirDocSel): Promise<BirDocSummary> {
  const { cte, where } = birDocQuery(sel);
  const typeSums = Prisma.raw(BIR_TYPES.map((t) => `COALESCE(sum(x."${t.key}"), 0) AS "${t.key}"`).join(", "));
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`${cte}
      SELECT count(*) AS n, COALESCE(sum(x.asum), 0) AS asum, COALESCE(sum(x.bir), 0) AS bir,
             COALESCE(sum(x.munis), 0) AS munis, ${typeSums}
      FROM x WHERE ${where}`),
  );
  const r = rows[0] ?? {};
  const tushum = toNum(r.asum);
  const bir = toNum(r.bir);
  return { n: toNum(r.n), tushum, biriktirilgan: bir, farq: tushum - bir, munis: toNum(r.munis), types: birTypes(r) };
}

export const getBirDocSummary = (sel: BirDocSel) =>
  unstable_cache(computeBirDocSummary, ["taq-bir-docs-sum-v1"], cacheOpts())(sel);

function birDocRow(r: Row): BirDoc {
  const tushum = toNum(r.asum);
  const bir = toNum(r.bir);
  return {
    id: String(r.id),
    docDate: isoDate(r.doc_date),
    docNum: str(r.doc_num),
    payer: str(r.cl_name),
    note: str(r.anote),
    tushum,
    biriktirilgan: bir,
    farq: tushum - bir,
    munis: toNum(r.munis),
    types: birTypes(r),
  };
}

async function computeBirDocPage(sel: BirDocSel, page: number): Promise<BirDoc[]> {
  const { cte, where } = birDocQuery(sel);
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`${cte}
      SELECT x.* FROM x WHERE ${where}
      ORDER BY x.doc_date DESC NULLS LAST, x.id DESC
      LIMIT ${PAGE_SIZE}::int OFFSET ${(page - 1) * PAGE_SIZE}::int`),
  );
  return rows.map(birDocRow);
}

export async function listBirDocs(sel: BirDocSel, limit: number): Promise<BirDoc[]> {
  const { cte, where } = birDocQuery(sel);
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`${cte}
      SELECT x.* FROM x WHERE ${where}
      ORDER BY x.doc_date NULLS LAST, x.id
      LIMIT ${limit}::int`),
  );
  return rows.map(birDocRow);
}

export const getBirDocPage = (sel: BirDocSel, page: number) =>
  unstable_cache(computeBirDocPage, ["taq-bir-docs-page-v1"], cacheOpts())(sel, page);

export function totalBir(rows: BirRow[]): BirRow {
  const add = (a: BirAmounts, b: BirAmounts): BirAmounts => ({
    tushum: a.tushum + b.tushum,
    biriktirilgan: a.biriktirilgan + b.biriktirilgan,
    farq: a.farq + b.farq,
  });
  const zero = (): BirAmounts => ({ tushum: 0, biriktirilgan: 0, farq: 0 });
  const t: BirRow = { id: null, name: "J A M I", ...zero(), day: zero(), munis: 0, types: {} as Record<BirType, number> };
  for (const k of BIR_TYPES) t.types[k.key] = 0;
  for (const r of rows) {
    Object.assign(t, add(t, r));
    t.day = add(t.day, r.day);
    t.munis += r.munis;
    for (const k of BIR_TYPES) t.types[k.key] += r.types[k.key];
  }
  return t;
}
