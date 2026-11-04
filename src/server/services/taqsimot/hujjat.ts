import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { readOnly } from "@/lib/projectDb";
import { CHANNELS, channelByRt } from "@/lib/channels";
import { isPaid } from "@/lib/uzasbo";
import type { Metric } from "@/server/services/payments";
import { isoDate, isoTs, str, toNum, type Row } from "@/server/services/sqlUtil";
import { ITEMS_ARR } from "@/server/services/uzasboSql";
import { ITEM_SHARES, SINGLE_ITEM_RT, bool, cacheOpts, strList } from "./shared";

export interface PayDoc {
  id: string;
  docNum: string | null;
  docDate: string | null;
  asum: number;
  type: string | null;
  payer: string | null;
  receiver: string | null;
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
  shares: Record<string, Share>;
  paidTimes: Record<string, number>;
}

export type SendRole = "asosiy" | "tarix" | "takror";

export interface DistSend {
  id: string;
  rt: number;
  channelKey: string | null;
  channelLabel: string;
  receiverName: string | null;
  receiverSum: number;
  status: string;
  uzasboStatus: number | null;
  reason: string | null;
  treasDate: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  createdAt: string | null;
  recreated: string | null;
  itemCount: number;
  ourIds: string[];
  docShare: number;
  paid: boolean;
  role: SendRole;
}

export interface ChannelDist {
  key: string;
  label: string;
  share: number;
  accepted: number;
  included: number;
  paid: number;
  lastPaid: string | null;
  noSend: number;
  extraPaid: number;
}

export interface Distribution {
  doc: PayDoc;
  items: DistItem[];
  sends: DistSend[];
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

  const primary = new Map<string, string>();
  const inSend = new Set<string>();
  for (const [key, list] of byKey) {
    const [itemId, chKey] = key.split(":");
    const paidList = list.filter((s) => s.paid);
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

export async function findPayIdByItem(itemId: string): Promise<string | null> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`SELECT pay_id FROM payment_items WHERE id = ${itemId}::bigint`),
  );
  return str(rows[0]?.pay_id);
}
