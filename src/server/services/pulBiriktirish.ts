import { Prisma } from "@prisma/client";
import { CHANNELS } from "@/lib/channels";
import { readOnly, writeTx } from "@/lib/projectDb";
import { isoDate, isoTs, str, toNum, type Row } from "@/server/services/sqlUtil";
import { BIR_TYPES } from "@/server/services/taqsimot/biriktirish";

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
  openShares: ShareRow[];
  canDetach: boolean;
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
  const openShares = shares.filter((s) => s.sum > 0 && !s.blocker);
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
    openShares,
    canDetach: state === 1 && blockers.length > 0 && openShares.length > 0,
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
  | { ok: true; id: string; payments: PaymentsSync }
  | { ok: false; sabab: string };

function dbMessage(msg: string): string {
  const m = msg.match(/Message:\s*`([^`]+)`/) ?? msg.match(/(ERROR:[^\n]+)/);
  const text = (m?.[1] ?? msg.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "").trim();
  return text.replace(/^ERROR:\s*/, "").slice(0, 300);
}

function writeError(e: unknown, tag: string): string {
  console.error(tag, e);
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("PROJECT_WRITE_DATABASE_URL")) return "Yozuv ulanishi sozlanmagan.";
  const detail = dbMessage(msg);
  if (/permission denied/i.test(msg)) return `Bazada ruxsat yo'q: ${detail || "yozuv roliga huquq berilmagan"}.`;
  return `Baza amalni rad etdi${detail ? `: ${detail}` : "."}`;
}

class Refuse extends Error {}

export interface PaymentsSync {
  paymentsId: string | null;
  ustun: string | null;
  kamaydi: string;
}

async function syncPayments(
  tx: Prisma.TransactionClient,
  payId: string | null,
  payType: number,
  delta: string,
): Promise<PaymentsSync> {
  const col = BIR_TYPES[payType - 1]?.col ?? null;
  if (!payId || Number(delta) === 0) return { paymentsId: null, ustun: col, kamaydi: delta };
  const sets = Prisma.raw(
    ["parsing_sum = COALESCE(p.parsing_sum, 0) - d.v", ...(col ? [`${col} = COALESCE(p.${col}, 0) - d.v`] : []), "updated_at = localtimestamp"].join(", "),
  );
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE payments p SET ${sets}
    FROM (SELECT ${delta}::numeric AS v) d
    WHERE p.pay_id = ${payId}::bigint AND p.state = 1
    RETURNING p.id::text AS id`);
  if (rows.length > 1) throw new Refuse(`To'lov hujjati #${payId} uchun payments da ${rows.length} ta faol yozuv bor, amal bekor qilindi.`);
  return { paymentsId: rows[0]?.id ?? null, ustun: col, kamaydi: delta };
}

export interface DetachedShare {
  key: string;
  label: string;
  sum: string;
}

export type DetachResult =
  | { ok: true; id: string; ajratildi: DetachedShare[]; asumOldin: string; asumKeyin: string; payments: PaymentsSync }
  | { ok: false; sabab: string };

const LOCK_COLS = Prisma.raw(
  CHANNELS.map((c) => `pi.${c.sum}::text AS "${c.key}_s", (pi.${c.sum} > 0) AS "${c.key}_p", pi.${c.sent} AS "${c.key}_t"`).join(", "),
);

export async function detachOpenChannels(id: string): Promise<DetachResult> {
  if (!/^\d{1,18}$/.test(id)) return { ok: false, sabab: "ID faqat raqamlardan iborat bo'lishi kerak." };

  try {
    return await writeTx(async (tx) => {
      const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
        SELECT pi.state, pi.asum::text AS asum, pi.pay_id::text AS pay_id, pi.pay_type, ${LOCK_COLS}
        FROM payment_items pi WHERE pi.id = ${id}::bigint FOR UPDATE`);
      const r = rows[0];
      if (!r) throw new Refuse("Bunday biriktirish topilmadi.");
      if (Number(r.state) !== 1) throw new Refuse(`Bu qism allaqachon faol emas (state = ${Number(r.state)}).`);

      const positive = CHANNELS.filter((c) => r[`${c.key}_p`] === true);
      const blocked = positive.filter((c) => r[`${c.key}_t`] === true);
      const open = positive.filter((c) => r[`${c.key}_t`] !== true);
      if (blocked.length === 0) throw new Refuse("To'siq yo'q: oddiy bekor qilishdan foydalaning.");
      if (open.length === 0) throw new Refuse("Ajratiladigan kanal yo'q: hamma kanal topshiriqnomaga kiritilgan.");

      const sets = Prisma.raw(
        [
          ...open.flatMap((c) => [`${c.sum} = 0`, `${c.accept} = false`]),
          `asum = pi.asum - (${open.map((c) => `pi.${c.sum}`).join(" + ")})`,
          `parsing_sum = COALESCE(pi.parsing_sum, 0) - (${open.map((c) => `CASE WHEN pi.${c.accept} IS TRUE THEN pi.${c.sum} ELSE 0 END`).join(" + ")})`,
          `no_parsing_sum = COALESCE(pi.no_parsing_sum, 0) - (${open.map((c) => `CASE WHEN pi.${c.accept} IS TRUE THEN 0 ELSE pi.${c.sum} END`).join(" + ")})`,
          "updated_at = localtimestamp",
        ].join(", "),
      );
      const updated = await tx.$queryRaw<{ asum: string; delta: string }[]>(Prisma.sql`
        UPDATE payment_items pi SET ${sets}
        WHERE pi.id = ${id}::bigint AND pi.state = 1
        RETURNING pi.asum::text AS asum, (${r.asum}::numeric - pi.asum)::text AS delta`);
      if (updated.length === 0) throw new Refuse("Amal bajarilmadi, qism o'zgargan bo'lishi mumkin. Sahifani yangilang.");
      const payments = await syncPayments(tx, r.pay_id === null ? null : String(r.pay_id), Number(r.pay_type), updated[0].delta);

      return {
        ok: true as const,
        id,
        ajratildi: open.map((c) => ({ key: c.key, label: c.label, sum: String(r[`${c.key}_s`]) })),
        asumOldin: String(r.asum),
        asumKeyin: updated[0].asum,
        payments,
      };
    });
  } catch (e) {
    if (e instanceof Refuse) return { ok: false, sabab: e.message };
    return { ok: false, sabab: writeError(e, "[pul-biriktirish:ajratish]") };
  }
}

export async function cancelAttachment(id: string): Promise<CancelResult> {
  if (!/^\d{1,18}$/.test(id)) return { ok: false, sabab: "ID faqat raqamlardan iborat bo'lishi kerak." };

  let done: { id: string; payments: PaymentsSync } | null = null;
  try {
    done = await writeTx(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; pay_id: string | null; pay_type: number | null; asum: string }[]>(Prisma.sql`
        UPDATE payment_items pi
        SET state = 0, updated_at = localtimestamp
        WHERE pi.id = ${id}::bigint AND pi.state = 1 AND NOT (${BLOCKED})
        RETURNING pi.id::text AS id, pi.pay_id::text AS pay_id, pi.pay_type, COALESCE(pi.asum, 0)::text AS asum`);
      if (rows.length === 0) return null;
      const payments = await syncPayments(tx, rows[0].pay_id, Number(rows[0].pay_type), rows[0].asum);
      return { id: rows[0].id, payments };
    });
  } catch (e) {
    if (e instanceof Refuse) return { ok: false, sabab: e.message };
    return { ok: false, sabab: writeError(e, "[pul-biriktirish]") };
  }

  if (done) return { ok: true, ...done };

  const cur = await findItem(id);
  if (!cur) return { ok: false, sabab: "Bunday biriktirish topilmadi." };
  if (!cur.active) return { ok: false, sabab: `Bu qism allaqachon faol emas (state = ${cur.state}).` };
  if (cur.blockers.length > 0) {
    return { ok: false, sabab: `Topshiriqnomaga kiritilgan: ${cur.blockers.join(", ")}. Bekor qilib bo'lmaydi.` };
  }
  return { ok: false, sabab: "Amal bajarilmadi, qism o'zgargan bo'lishi mumkin. Sahifani yangilang." };
}
