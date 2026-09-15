/**
 * `project` bazasidan kelgan xom qatorlarni o'girish — `payments.ts` va `taqsimot.ts` uchun umumiy.
 */

export type Row = Record<string, unknown>;

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v); // bigint va Prisma.Decimal ikkalasi ham to'g'ri o'giriladi
  return Number.isFinite(n) ? n : 0;
}

/** `date` ustuni → "YYYY-MM-DD". Prisma uni UTC yarim tunidagi `Date` qilib beradi. */
export function isoDate(v: unknown): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null;
}

/**
 * `timestamp WITHOUT time zone` → "YYYY-MM-DD HH:mm:ss" (devor soati, o'zgarishsiz).
 * ⚠️ Prisma bunday qiymatni UTC deb o'qiydi — ISO satrning o'zi aynan bazadagi vaqt.
 */
export function isoTs(v: unknown): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 19).replace("T", " ") : null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
