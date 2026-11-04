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
