/**
 * G'aznachilik (UzASBO) holatlari — `uzasbo_send` topshiriqnomalari va ulush belgilari.
 * Qiymatlar jonli bazadan aniqlangan (server, 2026-09-15). Client'da ham ishlatsa bo'ladi.
 *
 * ⚠️ Pul haqiqatda TO'LANGAN = `status = 'SENT' AND uzasbo_status = 4` (javobi "000-":
 * 177 487 ta, ~730 mlrd). Boshqa kodlar (1, 3, 5, 12, 42 "BAD FILE", 43 "K00-…") — jarayonda
 * yoki xato; ularning rasmiy ma'nosi tasdiqlanmagan, shuning uchun kodning o'zi ko'rsatiladi.
 * ⚠️ `payment_items.sent_*` — topshiriqnomaga KIRITILGAN belgisi (CREATED holatida ham true),
 * g'aznachilik to'lagani EMAS. Ilovadagi "O'tkazilgan" hozircha shu belgiga tayanadi.
 */

export const PAID_UZASBO_STATUS = 4;

export const isPaid = (status: string, uzasboStatus: number | null): boolean =>
  status === "SENT" && uzasboStatus === PAID_UZASBO_STATUS;

export type Tone = "ok" | "wait" | "info" | "bad" | "off";

export const TONE_CLS: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  wait: "bg-amber-50 text-amber-800",
  info: "bg-sky-50 text-sky-800",
  bad: "bg-red-50 text-red-700",
  off: "bg-slate-100 text-slate-500",
};

/** Topshiriqnoma holati (`uzasbo_send.status` ENUM + g'aznachilik javob kodi). */
export function sendState(status: string, uzasboStatus: number | null): { label: string; tone: Tone } {
  switch (status) {
    case "SENT":
      return isPaid(status, uzasboStatus)
        ? { label: "To'langan", tone: "ok" }
        : { label: uzasboStatus === null ? "Yuborilgan" : `Yuborilgan · kod ${uzasboStatus}`, tone: "wait" };
    case "CREATED":
      return { label: "Yaratilgan, yuborilmagan", tone: "wait" };
    case "REJECTED":
      return { label: uzasboStatus === null ? "Rad etilgan" : `Rad etilgan · kod ${uzasboStatus}`, tone: "bad" };
    case "RECREATED":
      return { label: "Qayta yaratilgan", tone: "off" };
    case "DELETED":
      return { label: "O'chirilgan", tone: "off" };
    default:
      return { label: status, tone: "off" };
  }
}

/** Bitta qismning bitta kanal bo'yicha ulushi qaysi bosqichda. */
export function shareState(accepted: boolean | null, sent: boolean | null, paidTimes: number): { label: string; tone: Tone } {
  if (paidTimes >= 2) return { label: `${paidTimes} marta to'langan`, tone: "bad" };
  if (paidTimes === 1) return { label: "G'aznachilikda to'langan", tone: "ok" };
  if (sent === true) {
    return accepted === true
      ? { label: "Topshiriqnomaga kiritilgan, to'lanmagan", tone: "wait" }
      : { label: "Tasdiqlanmasdan kiritilgan", tone: "bad" };
  }
  if (accepted === true) return { label: "Tasdiqlangan, kiritilmagan", tone: "info" };
  return { label: "Tasdiqlanmagan", tone: "off" };
}
