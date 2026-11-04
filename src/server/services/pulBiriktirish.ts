import { Prisma } from "@prisma/client";
import { CHANNELS } from "@/lib/channels";
import { readOnly, writeTx } from "@/lib/projectDb";
import { isoDate, isoTs, str, toNum, type Row } from "@/server/services/sqlUtil";

export interface ShareRow {
  key: string;
  label: string;
  sum: number;
  accepted: boolean | null;
  sent: boolean | null;
  blocker: boolean;
}

export interface CancelTarget {
  id: string;
  payId: string | null;
  state: number;
  active: boolean;
  asum: number;
  docDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  region: string | null;
  district: string | null;
  contractId: string | null;
  contractNumber: string | null;
  contractActive: boolean;
  ownerName: string | null;
  ownerTin: string | null;
  docNum: string | null;
  docPayer: string | null;
  docAsum: number | null;
  shares: ShareRow[];
  sharesSum: number;
  blockers: string[];
  canCancel: boolean;
}

const BLOCKED = Prisma.raw(
  CHANNELS.map((c) => `(pi.${c.sum} > 0 AND pi.${c.sent} IS TRUE)`).join(" OR "),
);

const SHARE_COLS = Prisma.raw(
  CHANNELS.map((c) => `pi.${c.sum} AS "${c.key}_s", pi.${c.accept} AS "${c.key}_a", pi.${c.sent} AS "${c.key}_t"`).join(", "),
);

const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function toTarget(r: Row): CancelTarget {
  const shares: ShareRow[] = CHANNELS.map((c) => {
    const sum = toNum(r[`${c.key}_s`]);
    const sent = bool(r[`${c.key}_t`]);
    return { key: c.key, label: c.label, sum, accepted: bool(r[`${c.key}_a`]), sent, blocker: sum > 0 && sent === true };
  });
  const state = Number(r.state);
  const blockers = shares.filter((s) => s.blocker).map((s) => s.label);
  return {
    id: String(r.id),
    payId: str(r.pay_id),
    state,
    active: state === 1,
    asum: toNum(r.asum),
    docDate: isoDate(r.doc_date),
    createdAt: isoTs(r.created_at),
    updatedAt: isoTs(r.updated_at),
    region: str(r.region),
    district: str(r.district),
    contractId: str(r.contract_id),
    contractNumber: str(r.new_contract_number),
    contractActive: r.contract_active === true,
    ownerName: str(r.owner_name),
    ownerTin: str(r.owner_tin),
    docNum: str(r.doc_num),
    docPayer: str(r.cl_name),
    docAsum: r.doc_asum === null || r.doc_asum === undefined ? null : toNum(r.doc_asum),
    shares,
    sharesSum: shares.reduce((a, s) => a + s.sum, 0),
    blockers,
    canCancel: state === 1 && blockers.length === 0,
  };
}

export async function findItem(id: string): Promise<CancelTarget | null> {
  const rows = await readOnly((tx) =>
    tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT pi.id, pi.pay_id, pi.state, pi.asum, pi.doc_date, pi.created_at, pi.updated_at, pi.contract_id,
             ${SHARE_COLS},
             l.name2 AS region, l2.name2 AS district,
             p.doc_num, p.cl_name, p.asum AS doc_asum,
             co.new_contract_number, co.owner_name, co.owner_tin, co.active AS contract_active
      FROM payment_items pi
      LEFT JOIN lists l ON l.id = pi.obl_id AND l.type_id = 1
      LEFT JOIN lists l2 ON l2.id = pi.area_id AND l2.type_id = 2
      LEFT JOIN paydocs p ON p.id = pi.pay_id
      LEFT JOIN LATERAL (
        SELECT c.new_contract_number, c.owner_name, c.owner_tin, (c.state = 1 AND c.doc_status = 3) AS active
        FROM vw_all_contracts c WHERE c.id = pi.contract_id
        ORDER BY (c.state = 1 AND c.doc_status = 3) DESC NULLS LAST
        LIMIT 1
      ) co ON true
      WHERE pi.id = ${id}::bigint`),
  );
  return rows[0] ? toTarget(rows[0]) : null;
}

export type CancelResult =
  | { ok: true; id: string }
  | { ok: false; sabab: string };

function dbMessage(msg: string): string {
  const m = msg.match(/Message:\s*`([^`]+)`/) ?? msg.match(/(ERROR:[^\n]+)/);
  const text = (m?.[1] ?? msg.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "").trim();
  return text.replace(/^ERROR:\s*/, "").slice(0, 300);
}

export async function cancelAttachment(id: string): Promise<CancelResult> {
  if (!/^\d{1,18}$/.test(id)) return { ok: false, sabab: "ID faqat raqamlardan iborat bo'lishi kerak." };

  let updated: { id: bigint }[] = [];
  try {
    updated = await writeTx((tx) =>
      tx.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        UPDATE payment_items pi
        SET state = 0, updated_at = localtimestamp
        WHERE pi.id = ${id}::bigint AND pi.state = 1 AND NOT (${BLOCKED})
        RETURNING pi.id`),
    );
  } catch (e) {
    console.error("[pul-biriktirish]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("PROJECT_WRITE_DATABASE_URL")) return { ok: false, sabab: "Bekor qilish sozlanmagan (yozuv ulanishi yo'q)." };
    const detail = dbMessage(msg);
    if (/permission denied/i.test(msg)) return { ok: false, sabab: `Bazada ruxsat yo'q — ${detail || "yozuv roliga huquq berilmagan"}.` };
    return { ok: false, sabab: `Baza amalni rad etdi${detail ? `: ${detail}` : "."}` };
  }

  if (updated.length > 0) return { ok: true, id: String(updated[0].id) };

  const cur = await findItem(id);
  if (!cur) return { ok: false, sabab: "Bunday biriktirish topilmadi." };
  if (!cur.active) return { ok: false, sabab: `Bu qism allaqachon faol emas (state = ${cur.state}).` };
  if (cur.blockers.length > 0) {
    return { ok: false, sabab: `Topshiriqnomaga kiritilgan: ${cur.blockers.join(", ")}. Bekor qilib bo'lmaydi.` };
  }
  return { ok: false, sabab: "Amal bajarilmadi — qism shu orada o'zgargan bo'lishi mumkin, sahifani yangilang." };
}
