import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { readOnly } from "@/lib/projectDb";
import { PAGE_SIZE, type Metric, type PaymentFilters } from "@/server/services/payments";
import { isoDate, str, toNum, type Row } from "@/server/services/sqlUtil";
import { cacheOpts, whereSql } from "./shared";

/** Muammoli hujjatlar: taqsimlanmagan / qisman / ortiqcha taqsimlangan. */

export const PROBLEM_KINDS = [
  {
    key: "taqsimlanmagan",
    label: "Taqsimlanmagan",
    sumLabel: "hujjat summasi",
    hint: "Hujjatning birorta faol qismi yo'q — pul hech bir shartnomaga biriktirilmagan.",
  },
  {
    key: "qisman",
    label: "Qisman taqsimlangan",
    sumLabel: "taqsimlanmagan qoldiq",
    hint: "Qismlar yig'indisi hujjat summasidan kam — qoldiq hech kimga biriktirilmagan.",
  },
  {
    key: "ortiqcha",
    label: "Ortiqcha taqsimlangan",
    sumLabel: "ortiqcha",
    hint: "Qismlar yig'indisi hujjat summasidan KO'P — kelgan puldan ortiq taqsimlangan, tekshirish kerak.",
  },
] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number]["key"];

export function isProblemKind(v: string | undefined): v is ProblemKind {
  return PROBLEM_KINDS.some((k) => k.key === v);
}

const KIND_COND: Record<ProblemKind, Prisma.Sql> = {
  taqsimlanmagan: Prisma.sql`t.pay_id IS NULL`,
  qisman: Prisma.sql`t.s < d.asum`,
  ortiqcha: Prisma.sql`t.s > d.asum`,
};

/** Filtr hujjat sanasi (`paydocs.doc_date`) va hududi bo'yicha; faqat faol kirimlar. */
function docConds(f: PaymentFilters): Prisma.Sql[] {
  const c: Prisma.Sql[] = [Prisma.sql`p.state = 1`];
  if (f.from) c.push(Prisma.sql`p.doc_date >= ${f.from}::date`);
  if (f.to) c.push(Prisma.sql`p.doc_date <= ${f.to}::date`);
  if (f.obl !== undefined) c.push(Prisma.sql`p.obl_id = ${f.obl}::int`);
  if (f.area !== undefined) c.push(Prisma.sql`p.area_id = ${f.area}::int`);
  return c;
}

/**
 * `d` — filtrdagi hujjatlar, `t` — ularning faol qismlari yig'indisi.
 * ⚠️ `pay_id` da indeks yo'q: `t` bitta hash-agregat (butun jadval skani), hujjat
 * boshiga LATERAL emas — u yuz minglab skanga aylanardi.
 */
function problemCtes(f: PaymentFilters): Prisma.Sql {
  return Prisma.sql`
    WITH d AS (
      SELECT p.id, p.doc_num, p.doc_date, p.asum, p.cl_name, p.obl_id, p.area_id
      FROM paydocs p WHERE ${whereSql(docConds(f))}
    ), t AS (
      SELECT pi.pay_id, sum(pi.asum) AS s, count(*) AS n
      FROM payment_items pi
      WHERE pi.state = 1 AND pi.pay_id IN (SELECT id FROM d)
      GROUP BY pi.pay_id
    )`;
}

export interface ProblemSummary {
  docs: Metric;
  /** `s`: taqsimlanmagan — hujjat summasi, qisman — qoldiq, ortiqcha — ortiqcha qism. */
  kinds: Record<ProblemKind, Metric>;
}

async function computeProblemSummary(f: PaymentFilters): Promise<ProblemSummary> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`${problemCtes(f)}
      SELECT count(*) AS docs_n, COALESCE(sum(d.asum), 0) AS docs_s,
             count(*) FILTER (WHERE ${KIND_COND.taqsimlanmagan}) AS none_n,
             COALESCE(sum(d.asum) FILTER (WHERE ${KIND_COND.taqsimlanmagan}), 0) AS none_s,
             count(*) FILTER (WHERE ${KIND_COND.qisman}) AS part_n,
             COALESCE(sum(d.asum - t.s) FILTER (WHERE ${KIND_COND.qisman}), 0) AS part_s,
             count(*) FILTER (WHERE ${KIND_COND.ortiqcha}) AS over_n,
             COALESCE(sum(t.s - d.asum) FILTER (WHERE ${KIND_COND.ortiqcha}), 0) AS over_s
      FROM d LEFT JOIN t ON t.pay_id = d.id`),
  );
  const r = rows[0] ?? {};
  return {
    docs: { n: toNum(r.docs_n), s: toNum(r.docs_s) },
    kinds: {
      taqsimlanmagan: { n: toNum(r.none_n), s: toNum(r.none_s) },
      qisman: { n: toNum(r.part_n), s: toNum(r.part_s) },
      ortiqcha: { n: toNum(r.over_n), s: toNum(r.over_s) },
    },
  };
}

export const getProblemSummary = (f: PaymentFilters) =>
  unstable_cache(computeProblemSummary, ["taq-problems-v1"], cacheOpts())(f);

export interface ProblemDoc {
  id: string;
  docNum: string | null;
  docDate: string | null;
  asum: number;
  attached: number;
  parts: number;
  payer: string | null;
  region: string | null;
  district: string | null;
}

async function computeProblemPage(kind: ProblemKind, f: PaymentFilters, page: number): Promise<ProblemDoc[]> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`${problemCtes(f)}
      SELECT d.id, d.doc_num, d.doc_date, d.asum, d.cl_name, COALESCE(t.s, 0) AS s, COALESCE(t.n, 0) AS n,
             l.name2 AS region, l2.name2 AS district
      FROM d
      LEFT JOIN t ON t.pay_id = d.id
      LEFT JOIN lists l ON l.id = d.obl_id AND l.type_id = 1
      LEFT JOIN lists l2 ON l2.id = d.area_id AND l2.type_id = 2
      WHERE ${KIND_COND[kind]}
      ORDER BY d.doc_date DESC NULLS LAST, d.id DESC
      LIMIT ${PAGE_SIZE}::int OFFSET ${(page - 1) * PAGE_SIZE}::int`),
  );
  return rows.map((r) => ({
    id: String(r.id),
    docNum: str(r.doc_num),
    docDate: isoDate(r.doc_date),
    asum: toNum(r.asum),
    attached: toNum(r.s),
    parts: toNum(r.n),
    payer: str(r.cl_name),
    region: str(r.region),
    district: str(r.district),
  }));
}

export const getProblemPage = (kind: ProblemKind, f: PaymentFilters, page: number) =>
  unstable_cache(computeProblemPage, ["taq-problem-page-v1"], cacheOpts())(kind, f, page);
