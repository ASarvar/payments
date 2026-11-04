import { Prisma } from "@prisma/client";
import { CHANNELS } from "@/lib/channels";
import { readOnly, writeTx } from "@/lib/projectDb";
import { isoDate, isoTs, str, toNum, type Row } from "@/server/services/sqlUtil";

/**
 * PUL BIRIKTIRISH — biriktirishni (`payment_items` qismini) BEKOR QILISH.
 *
 * ⚠️ Ilovadagi YAGONA yozuv amali: `payment_items.state = 0` (yumshoq o'chirish). Qolgan hamma
 * narsa `readOnly()` da qoladi. Yozuv alohida ulanish orqali (`writeTx` — `PROJECT_WRITE_DATABASE_URL`).
 *
 * Shart (foydalanuvchi qarori, 2026-11-04): summasi > 0 bo'lgan HAR BIR kanalning `sent_*` ustuni
 * `true` BO'LMASLIGI kerak. Ya'ni pul biror topshiriqnomaga kiritilgan bo'lsa — bekor qilib
 * bo'lmaydi. Qism allaqachon bekor qilingan (`state <> 1`) bo'lsa ham rad etiladi.
 * ⚠️ Shart ikki marta tekshiriladi: sahifada ko'rsatish uchun va YANGILASH so'rovining `WHERE`
 * ichida — oraliqda boshqa tizim belgi qo'yib ulgursa, yangilash shunchaki 0 qator o'zgartiradi.
 * ⚠️ Jadvalda `trg_audit` (o'sha tizim auditi) va `trg_check_payment_items_limit` (BEFORE UPDATE)
 * triggerlari bor — ikkinchisi yangilashni rad etishi mumkin, xato foydalanuvchiga ko'rsatiladi.
 */

export interface ShareRow {
  key: string;
  label: string;
  sum: number;
  accepted: boolean | null;
  sent: boolean | null;
  /** Shu kanal bekor qilishga to'sqinlik qilyaptimi (summasi > 0 va `sent_*` true). */
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
  /** Hujjat (`paydocs`) — kontekst uchun. */
  docNum: string | null;
  docPayer: string | null;
  docAsum: number | null;
  shares: ShareRow[];
  /** Ulushlar yig'indisi (12 kanal). */
  sharesSum: number;
  blockers: string[];
  canCancel: boolean;
}

/** `sum > 0 AND sent IS TRUE` — kamida bitta kanalda bo'lsa, bekor qilish MUMKIN EMAS. */
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

/** Qismni ID bo'yicha topadi (faqat o'qish). `null` — bunday qism yo'q. */
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

/**
 * Biriktirishni bekor qiladi: `state = 0`, `updated_at` yangilanadi.
 * Shart `WHERE` ichida — qoida buzilgan bo'lsa hech narsa o'zgarmaydi va sabab qaytariladi.
 */
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
    if (/permission denied/i.test(msg)) return { ok: false, sabab: "Bazada ruxsat yo'q — yozuv roliga UPDATE huquqi berilmagan." };
    // `trg_check_payment_items_limit` kabi triggerlar o'z xabarini beradi.
    const first = msg.split("\n").find((l) => /ERROR|error/.test(l)) ?? "";
    return { ok: false, sabab: `Baza amalni rad etdi${first ? `: ${first.trim().slice(0, 200)}` : "."}` };
  }

  if (updated.length > 0) return { ok: true, id: String(updated[0].id) };

  // 0 qator — nega? Joriy holatni o'qib, aniq sabab aytamiz.
  const cur = await findItem(id);
  if (!cur) return { ok: false, sabab: "Bunday biriktirish topilmadi." };
  if (!cur.active) return { ok: false, sabab: `Bu qism allaqachon faol emas (state = ${cur.state}).` };
  if (cur.blockers.length > 0) {
    return { ok: false, sabab: `Topshiriqnomaga kiritilgan: ${cur.blockers.join(", ")}. Bekor qilib bo'lmaydi.` };
  }
  return { ok: false, sabab: "Amal bajarilmadi — qism shu orada o'zgargan bo'lishi mumkin, sahifani yangilang." };
}
