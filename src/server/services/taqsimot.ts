import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";
import { readOnly } from "@/lib/projectDb";
import { CHANNELS, channelByRt } from "@/lib/channels";
import { PAID_UZASBO_STATUS, isPaid } from "@/lib/uzasbo";
import { PAGE_SIZE, PAYMENTS_CACHE_TAG, getRegions, type Metric, type PaymentFilters } from "@/server/services/payments";
import { isoDate, isoTs, str, toNum, type Row } from "@/server/services/sqlUtil";
import { shiftDate } from "@/lib/format";

/**
 * TAQSIMOT — bitta to'lov hujjati (`paydocs`) pulining yo'li. Bu bo'limning BARCHA SQL'i shu yerda.
 *
 *   paydocs.id ─→ payment_items.pay_id   qismlar (hujjat shartnomalarga bo'lingan)
 *              ─→ 12 kanal ulushi        *_sum / *_accept / sent_*  (`lib/channels.ts`)
 *              ─→ uzasbo_send            g'aznachilikka topshiriqnoma: bitta oluvchi, bir davr,
 *                                        KO'P qism (`payment_items_id` — vergulli id matni)
 *
 * Jonli sxema (server, 2026-09-15): `paydocs` 827 262 ta — faol kirim `state = 1` (426 013 ta),
 * `state = 0` — chiqim/qaytarish (Расход/Возврат). `uzasbo_send` 309 640 ta.
 *
 * ⚠️ Bog'lanishlarda FK YO'Q — hammasi qiymat bo'yicha. `payment_items.doc_id` — boshqa narsa
 *    (`pay_id` bilan birorta ham mos emas); `pay_id` da indeks yo'q, hujjat qismlari ~0.1 s.
 * ⚠️ Faqat `state = 1` qismlar hisobga kiradi (ilova qoidasi); bekorlari ko'rsatiladi, lekin sanalmaydi.
 * ⚠️ `sent_*` = topshiriqnomaga KIRITILGAN, to'langan emas. To'langan — `PAID` (`lib/uzasbo.ts`).
 * ⚠️ `uzasbo_send.status` — Postgres ENUM: Prisma xom so'rovda uni o'qiy olmaydi, `::text` SHART.
 * ⚠️ `uzasbo_send` da ham audit triggeri bor — faqat `readOnly()`.
 */

/**
 * Topshiriqnomadagi qism id'lari massivi. ⚠️ Serverdagi `idx_uzasbo_send_items_gin` ifodasi bilan
 * AYNAN bir xil — boshqacha yozilsa indeks ishlamaydi va har so'rov 300 ming qatorni skanlaydi.
 * ⚠️ `String.raw` — oddiy shablonda `\s` jimgina `s` ga aylanardi.
 */
const ITEMS_ARR = Prisma.raw(String.raw`string_to_array(regexp_replace(u.payment_items_id, '\s+', '', 'g'), ',')`);

/** G'aznachilik ijro etgan (pul to'langan) topshiriqnoma. */
const PAID = Prisma.raw(`u.state = 1 AND u.status = 'SENT' AND u.uzasbo_status = ${PAID_UZASBO_STATUS}`);

/**
 * ⚠️ `payment_items_id` HAR DOIM "shu topshiriqnoma to'lagan qismlar" EMAS (server, 2026-09-15):
 * birlashtirilgan turlarda (QQS, mahalliy, markaz, PF-16, …) ro'yxat ko'pincha DAVR BOSHIDAN
 * TO'PLANADI — `date_from` qotib, `date_to` o'sadi, har yangi topshiriqnoma oldingi qismlarni ham
 * qayta sanaydi, summasi esa faqat yangilari uchun (bitta QQS qismi 531 ta to'langan topshiriqnomada).
 * Shuning uchun (qism, kanal) ning ASOSIY topshiriqnomasi — uni o'z ichiga olgan BIRINCHI to'langani;
 * qolganlari "takroriy ro'yxat", summaga kirmaydi.
 * Faqat balansda saqlovchi (rt 4) da har topshiriqnomada BITTA qism (summasi 30/30 mos) — ikki marta
 * to'lashni ro'yxatdan faqat SHU tur uchun aniqlash mumkin.
 */
const SINGLE_ITEM_RT = 4;

/** 12 kanal ustunlari — nomlar FAQAT `CHANNELS` dan (whitelist). */
const ITEM_SHARES = Prisma.raw(
  CHANNELS.map((c) => `pi.${c.sum} AS "${c.key}_s", pi.${c.accept} AS "${c.key}_a", pi.${c.sent} AS "${c.key}_t"`).join(", "),
);

const cacheOpts = () => ({ revalidate: env.CACHE_SECONDS, tags: [PAYMENTS_CACHE_TAG] });
const whereSql = (conds: Prisma.Sql[]) => Prisma.join(conds, " AND ");
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

// ── Bitta hujjat ────────────────────────────────────────────────────────────

export interface PayDoc {
  id: string;
  docNum: string | null;
  docDate: string | null;
  asum: number;
  type: string | null;
  /** `cl_name` — "STIR NOMI HISOB MFO" bitta satrda. */
  payer: string | null;
  /** `ca_name` — qabul qiluvchi (odatda g'aznachilik hisobi). */
  receiver: string | null;
  /** `anote` — to'lov maqsadi. */
  note: string | null;
  region: string | null;
  district: string | null;
  active: boolean;
  createdAt: string | null;
}

export interface Share {
  sum: number;
  accepted: boolean | null;
  sent: boolean | null;
}

export interface DistItem {
  id: string;
  active: boolean;
  asum: number;
  docDate: string | null;
  createdAt: string | null;
  contractNumber: string | null;
  contractActive: boolean;
  ownerName: string | null;
  ownerTin: string | null;
  /** Kanal kaliti → ulush (faqat summasi > 0 lari). */
  shares: Record<string, Share>;
  /**
   * Kanal kaliti → g'aznachilikda to'langan: 1 — to'langan; 2+ — faqat balansda saqlovchi uchun
   * (boshqa kanallarda takroriy ro'yxat ikki marta to'lash degani emas — `SINGLE_ITEM_RT`).
   */
  paidTimes: Record<string, number>;
}

/**
 * Topshiriqnomaning shu hujjatdagi o'rni: `asosiy` — kamida bitta ulushni shu to'lagan (yoki
 * to'lanmagan bo'lsa — hozirgi jarayondagisi); `tarix` — rad etilgan/qayta yaratilgan/o'chirilgan;
 * `takror` — to'plangan ro'yxatda qismni QAYTA sanagan, summaga kirmaydi.
 */
export type SendRole = "asosiy" | "tarix" | "takror";

export interface DistSend {
  id: string;
  rt: number;
  channelKey: string | null;
  channelLabel: string;
  receiverName: string | null;
  /** Topshiriqnomaning TO'LIQ summasi (boshqa hujjatlar qismlari ham kiradi). */
  receiverSum: number;
  status: string;
  uzasboStatus: number | null;
  reason: string | null;
  treasDate: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  createdAt: string | null;
  /** Qaysi RAD ETILGAN topshiriqnoma o'rniga yaratilgan (yangi → eski). */
  recreated: string | null;
  /** Topshiriqnomadagi jami qism soni. */
  itemCount: number;
  /** Shu hujjatning topshiriqnoma ro'yxatidagi qismlari. */
  ourIds: string[];
  /** Shu hujjat qismlarining ulushi — faqat bu topshiriqnoma ASOSIY bo'lgan ulushlar. */
  docShare: number;
  paid: boolean;
  role: SendRole;
}

export interface ChannelDist {
  key: string;
  label: string;
  share: number;
  accepted: number;
  /** `sent_*` belgisi bor — topshiriqnomaga kiritilgan. */
  included: number;
  /** G'aznachilikda to'langan (bir necha marta bo'lsa ham bir marta sanaladi). */
  paid: number;
  lastPaid: string | null;
  /** Belgi bor, lekin topshiriqnoma (o'chirilmagan) topilmadi. */
  noSend: number;
  /** Ikki va undan ko'p marta to'langan — ORTIQCHA qismi (faqat balansda saqlovchi). */
  extraPaid: number;
}

export interface Distribution {
  doc: PayDoc;
  items: DistItem[];
  /** Hammasi, `takror` lari ham (Excel uchun); sahifa ularni yashiradi. */
  sends: DistSend[];
  /** 12 kanal, `CHANNELS` tartibida (faqat faol qismlar). */
  channels: ChannelDist[];
  attached: Metric;
  channelsSum: number;
  paidSum: number;
}

async function computeDistribution(id: string): Promise<Distribution | null> {
  return readOnly(async (tx) => {
    const [d] = await tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT p.id, p.doc_num, p.doc_date, p.asum, p.type, p.cl_name, p.ca_name, p.anote, p.state, p.created_at,
             l.name2 AS region, l2.name2 AS district
      FROM paydocs p
      LEFT JOIN lists l ON l.id = p.obl_id AND l.type_id = 1
      LEFT JOIN lists l2 ON l2.id = p.area_id AND l2.type_id = 2
      WHERE p.id = ${id}::bigint`);
    if (!d) return null;

    // ⚠️ Shartnoma `LATERAL … LIMIT 1` — ko'rinishda dublikat id bo'lsa ham qator ko'paymaydi.
    // Faol bo'lmasa ham raqami ko'rsatiladi (faoli birinchi).
    const itemRows = await tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT pi.id, pi.state, pi.asum, pi.doc_date, pi.created_at, ${ITEM_SHARES},
             co.new_contract_number, co.owner_name, co.owner_tin, co.active AS contract_active
      FROM payment_items pi
      LEFT JOIN LATERAL (
        SELECT c.new_contract_number, c.owner_name, c.owner_tin, (c.state = 1 AND c.doc_status = 3) AS active
        FROM vw_all_contracts c WHERE c.id = pi.contract_id
        ORDER BY (c.state = 1 AND c.doc_status = 3) DESC NULLS LAST
        LIMIT 1
      ) co ON true
      WHERE pi.pay_id = ${id}::bigint
      ORDER BY pi.state DESC, pi.id`);

    const ids = itemRows.map((r) => String(r.id));
    // ⚠️ `ORDER BY … u.id` — `assemble` "birinchi to'langan"ni shu tartibga tayanib tanlaydi.
    const sendRows =
      ids.length === 0
        ? []
        : await tx.$queryRaw<Row[]>(Prisma.sql`
            SELECT u.id, u.receiver_type, u.receiver_name, u.receiver_sum, u.status::text AS status, u.uzasbo_status,
                   u.uzasbo_reason, u.uzasbo_treas_oper_date, u.date_from, u.date_to, u.created_at, u.recreated,
                   cardinality(${ITEMS_ARR}) AS item_count,
                   ARRAY(SELECT e FROM unnest(${ITEMS_ARR}) AS e WHERE e = ANY(${ids}::text[])) AS ours
            FROM uzasbo_send u
            WHERE u.state = 1 AND ${ITEMS_ARR} && ${ids}::text[]
            ORDER BY u.receiver_type, u.id`);

    return assemble(d, itemRows, sendRows);
  });
}

function assemble(d: Row, itemRows: Row[], sendRows: Row[]): Distribution {
  const doc: PayDoc = {
    id: String(d.id),
    docNum: str(d.doc_num),
    docDate: isoDate(d.doc_date),
    asum: toNum(d.asum),
    type: str(d.type),
    payer: str(d.cl_name),
    receiver: str(d.ca_name),
    note: str(d.anote),
    region: str(d.region),
    district: str(d.district),
    active: Number(d.state) === 1,
    createdAt: isoTs(d.created_at),
  };

  const items: DistItem[] = itemRows.map((r) => {
    const shares: Record<string, Share> = {};
    for (const c of CHANNELS) {
      const s = toNum(r[`${c.key}_s`]);
      if (s > 0) shares[c.key] = { sum: s, accepted: bool(r[`${c.key}_a`]), sent: bool(r[`${c.key}_t`]) };
    }
    return {
      id: String(r.id),
      active: Number(r.state) === 1,
      asum: toNum(r.asum),
      docDate: isoDate(r.doc_date),
      createdAt: isoTs(r.created_at),
      contractNumber: str(r.new_contract_number),
      contractActive: r.contract_active === true,
      ownerName: str(r.owner_name),
      ownerTin: str(r.owner_tin),
      shares,
      paidTimes: {},
    };
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const base = sendRows.map((r) => {
    const rt = Number(r.receiver_type);
    const ch = channelByRt(rt);
    const status = String(r.status);
    const code = r.uzasbo_status === null || r.uzasbo_status === undefined ? null : Number(r.uzasbo_status);
    return {
      id: String(r.id),
      rt,
      channelKey: ch?.key ?? null,
      channelLabel: ch?.label ?? `Tur ${rt}`,
      receiverName: str(r.receiver_name),
      receiverSum: toNum(r.receiver_sum),
      status,
      uzasboStatus: code,
      reason: str(r.uzasbo_reason),
      treasDate: isoDate(r.uzasbo_treas_oper_date),
      dateFrom: isoDate(r.date_from),
      dateTo: isoDate(r.date_to),
      createdAt: isoTs(r.created_at),
      recreated: str(r.recreated),
      itemCount: toNum(r.item_count),
      ourIds: strList(r.ours),
      paid: isPaid(status, code),
    };
  });

  // (qism, kanal) → uni ro'yxatida keltirgan topshiriqnomalar, id tartibida (SQL shunday beradi).
  const byKey = new Map<string, typeof base>();
  for (const s of base) {
    if (!s.channelKey) continue;
    for (const itemId of s.ourIds) {
      const key = `${itemId}:${s.channelKey}`;
      const list = byKey.get(key);
      if (list) list.push(s);
      else byKey.set(key, [s]);
    }
  }

  /** `${qism}:${kanal}` → ASOSIY topshiriqnoma id si (`SINGLE_ITEM_RT` izohiga qarang). */
  const primary = new Map<string, string>();
  /** O'chirilmagan topshiriqnomaga kirgan ulushlar. */
  const inSend = new Set<string>();
  for (const [key, list] of byKey) {
    const [itemId, chKey] = key.split(":");
    const paidList = list.filter((s) => s.paid);
    // To'langan bo'lsa — birinchi to'langani; aks holda eng so'nggi jarayondagisi.
    const main = paidList[0] ?? [...list].reverse().find((s) => s.status === "CREATED" || s.status === "SENT");
    if (main) primary.set(key, main.id);
    if (list.some((s) => s.status !== "DELETED")) inSend.add(key);
    const it = byId.get(itemId);
    if (it && paidList.length > 0) it.paidTimes[chKey] = list[0].rt === SINGLE_ITEM_RT ? paidList.length : 1;
  }

  const sends: DistSend[] = base.map((s) => {
    let docShare = 0;
    let isPrimary = false;
    for (const itemId of s.ourIds) {
      if (!s.channelKey || primary.get(`${itemId}:${s.channelKey}`) !== s.id) continue;
      isPrimary = true;
      docShare += byId.get(itemId)?.shares[s.channelKey]?.sum ?? 0;
    }
    const role: SendRole = isPrimary ? "asosiy" : s.status === "SENT" || s.status === "CREATED" ? "takror" : "tarix";
    return { ...s, docShare, role };
  });

  const active = items.filter((i) => i.active);
  const channels: ChannelDist[] = CHANNELS.map((c) => {
    const cd: ChannelDist = { key: c.key, label: c.label, share: 0, accepted: 0, included: 0, paid: 0, lastPaid: null, noSend: 0, extraPaid: 0 };
    for (const it of active) {
      const sh = it.shares[c.key];
      if (!sh) continue;
      cd.share += sh.sum;
      if (sh.accepted === true) cd.accepted += sh.sum;
      if (sh.sent === true) {
        cd.included += sh.sum;
        if (!inSend.has(`${it.id}:${c.key}`)) cd.noSend += sh.sum;
      }
      const times = it.paidTimes[c.key] ?? 0;
      if (times >= 1) cd.paid += sh.sum;
      if (times >= 2) cd.extraPaid += sh.sum * (times - 1);
    }
    for (const s of sends) {
      if (s.role !== "asosiy" || !s.paid || s.channelKey !== c.key || !s.treasDate) continue;
      if (!cd.lastPaid || s.treasDate > cd.lastPaid) cd.lastPaid = s.treasDate;
    }
    return cd;
  });

  return {
    doc,
    items,
    sends,
    channels,
    attached: { n: active.length, s: active.reduce((a, i) => a + i.asum, 0) },
    channelsSum: channels.reduce((a, c) => a + c.share, 0),
    paidSum: channels.reduce((a, c) => a + c.paid, 0),
  };
}

export const getDistribution = (id: string) => unstable_cache(computeDistribution, ["taq-doc-v2"], cacheOpts())(id);

/** Biriktirish (qism) ID si kiritilgan bo'lsa — uning hujjati. */
export async function findPayIdByItem(itemId: string): Promise<string | null> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`SELECT pay_id FROM payment_items WHERE id = ${itemId}::bigint`),
  );
  return str(rows[0]?.pay_id);
}

// ── Muammoli hujjatlar ──────────────────────────────────────────────────────

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

// ── Ikki marta to'langan (faqat balansda saqlovchi) ─────────────────────────

export interface DoublePaid {
  itemId: string;
  payId: string | null;
  docDate: string | null;
  region: string | null;
  contractNumber: string | null;
  ownerName: string | null;
  /** Necha marta to'langan (≥ 2). */
  times: number;
  sends: string[];
  /** Topshiriqnomalar summalari yig'indisi (to'langan jami). */
  paidTotal: number;
  /** Qismning balansda saqlovchi ulushi. */
  share: number;
  /** Ortiqcha to'langan: to'langan jami − ulush. */
  extra: number;
}

const DOUBLE_LIMIT = 5000;

/**
 * Balansda saqlovchi ulushi g'aznachilikda 2+ marta TO'LANGAN qismlar. Faqat rt 4 — boshqa
 * turlarda ro'yxat to'planadi va takror ikki marta to'lash degani emas (`SINGLE_ITEM_RT`).
 * Serverda 58 ta (2026-09-15). Kesh 1 soat.
 */
async function computeDoublePaid(): Promise<{ rows: DoublePaid[]; truncated: boolean }> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      WITH x AS (
        SELECT e AS item, u.id, u.receiver_sum
        FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_ARR}) AS e
        WHERE ${PAID} AND u.receiver_type = ${SINGLE_ITEM_RT}::int AND e ~ '^[0-9]+$'
      ), d AS (
        SELECT item::bigint AS item, count(*) AS n, sum(receiver_sum) AS paid, array_agg(id::text ORDER BY id) AS sends
        FROM x GROUP BY item HAVING count(*) > 1
      )
      SELECT d.item, d.n, d.sends, d.paid, pi.pay_id, pi.doc_date, pi.owner_sum AS share, l.name2 AS region,
             co.new_contract_number, co.owner_name
      FROM d
      LEFT JOIN payment_items pi ON pi.id = d.item
      LEFT JOIN lists l ON l.id = pi.obl_id AND l.type_id = 1
      LEFT JOIN LATERAL (
        SELECT c.new_contract_number, c.owner_name FROM vw_all_contracts c WHERE c.id = pi.contract_id LIMIT 1
      ) co ON true
      ORDER BY d.paid - COALESCE(pi.owner_sum, 0) DESC, d.item
      LIMIT ${DOUBLE_LIMIT + 1}::int`),
  );
  return {
    truncated: rows.length > DOUBLE_LIMIT,
    rows: rows.slice(0, DOUBLE_LIMIT).map((r) => {
      const share = toNum(r.share);
      const paidTotal = toNum(r.paid);
      return {
        itemId: String(r.item),
        payId: str(r.pay_id),
        docDate: isoDate(r.doc_date),
        region: str(r.region),
        contractNumber: str(r.new_contract_number),
        ownerName: str(r.owner_name),
        times: toNum(r.n),
        sends: strList(r.sends),
        paidTotal,
        share,
        extra: paidTotal - share,
      };
    }),
  };
}

export const getDoublePaid = () =>
  unstable_cache(computeDoublePaid, ["taq-double-v2"], { revalidate: 3600, tags: [PAYMENTS_CACHE_TAG] })();

// ── Biriktirish borishi (hududlar kesimida) ─────────────────────────────────

/**
 * "Ijara to'lovlaridan tushgan mablag'lar biriktirilishining borishi" — mavjud tizim (online-ijara.uz)
 * hisobotining AYNAN o'sha ta'rifi (foydalanuvchi bergan SQL, 2026-09-15; jamilari serverda
 * eski so'rov bilan tiyinigacha solishtirildi):
 *   tushum        = paydocs.asum                   (state = 1, doc_date davrda, hujjat hududi)
 *   biriktirilgan = payments.parsing_sum           (state = 1, doc_date davrda)
 *                 + munis_receive_payment.real_sum (state = 1, status > NEW, created_at davrda)
 *   shundan       = payments.*_sum turlari — MUNIS qismi turlarga bo'linmaydi (alohida ustun).
 * Asl so'rovdan ATAYLAB farqi: "bir kunda" — `gacha` kuni (aslida MUNIS qismi `current_date` bo'yicha
 * edi) va tushum = biriktirilgan + biriktirilmagan har doim bajariladi; asl so'rovdagi ishlatilmagan
 * `payment_items` LATERAL'i olib tashlangan; `created_at` indeks ishlaydigan ko'rinishda.
 * ⚠️ `payments` da tuman yo'q — faqat hududlar. Asl kabi faqat `lists` hududlari (id > 0).
 */
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
  /** tushum − biriktirilgan (manfiy — ortiqcha biriktirilgan). */
  farq: number;
}

export interface BirRow extends BirAmounts {
  id: number | null;
  name: string;
  /** `gacha` kuni. */
  day: BirAmounts;
  /** Biriktirilganning MUNIS orqali qismi. */
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

/** `payments` turlari yig'indisi (ustun nomlari — `BIR_TYPES` dan, whitelist). */
const BIR_TYPE_SUMS = Prisma.raw(BIR_TYPES.map((t) => `sum(${t.col}) AS "${t.key}"`).join(", "));

/**
 * `from` bo'lmasa — boshlanish chegarasiz; `obl` — faqat shu hudud (hudud sahifasi). Sanalar
 * YYYY-MM-DD, ikkalasi ham QO'SHIB.
 */
async function computeBiriktirish(from: string | undefined, to: string, obl?: number): Promise<BirRow[]> {
  // Uchala manbaga bir xil: boshlanish sanasi va (berilsa) hudud.
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

/**
 * Hudud sahifasidagi qatorlar (eski tizimdagidek): hisobot davri, joriy oy, kecha, bugun — hammasi
 * `gacha` ga nisbatan. `gacha` bugun bo'lmasa "kecha/bugun" o'rniga "oldingi/oxirgi kun".
 * ⚠️ Qatorlar KESISHADI — JAMI qatori ma'nosiz (eski tizimdagi jami ularni qo'shib yuborardi).
 */
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

// ── Biriktirish: bitta hudud hujjatlari ─────────────────────────────────────

/**
 * Hudud to'lov hujjatlari va har biriga biriktirilgani: `payments` + MUNIS — ikkalasi `pay_id` orqali.
 * ⚠️ Hudud jadvali `payments` ni O'Z sanasi/hududi, MUNIS ni `created_at` bo'yicha oladi, bu yerda esa
 * hujjatga `pay_id` orqali — ikkalasi bog'lanish to'liq bo'lgandagina teng.
 * ⚠️ `payments.pay_id` da alohida indeks yo'q — `pa` bitta hash-agregat (hujjat boshiga LATERAL emas).
 */
export const BIR_DOC_HOLATLAR = [
  { key: "hammasi", label: "Hammasi" },
  { key: "biriktirilmagan", label: "Biriktirilmagan qoldig'i bor" },
  { key: "toliq", label: "To'liq biriktirilgan" },
  { key: "ortiqcha", label: "Ortiqcha biriktirilgan" },
] as const;
export type BirDocHolat = (typeof BIR_DOC_HOLATLAR)[number]["key"];

export const isBirDocHolat = (v: string | undefined): v is BirDocHolat => BIR_DOC_HOLATLAR.some((h) => h.key === v);
export const isBirType = (v: string | undefined): v is BirType => BIR_TYPES.some((t) => t.key === v);

/** Tiyinlik yaxlitlash farqi "biriktirilmagan" deb sanalmasin. */
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
  if (sel.tur) conds.push(Prisma.raw(`x."${sel.tur}" > 0`)); // `tur` — BIR_TYPES kaliti (isBirType)
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

async function computeBirDocPage(sel: BirDocSel, page: number): Promise<BirDoc[]> {
  const { cte, where } = birDocQuery(sel);
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`${cte}
      SELECT x.* FROM x WHERE ${where}
      ORDER BY x.doc_date DESC NULLS LAST, x.id DESC
      LIMIT ${PAGE_SIZE}::int OFFSET ${(page - 1) * PAGE_SIZE}::int`),
  );
  return rows.map((r) => {
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
  });
}

export const getBirDocPage = (sel: BirDocSel, page: number) =>
  unstable_cache(computeBirDocPage, ["taq-bir-docs-page-v1"], cacheOpts())(sel, page);

/** JAMI qatori. */
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
