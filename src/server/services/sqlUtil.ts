export type Row = Record<string, unknown>;

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function isoDate(v: unknown): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null;
}

export function isoTs(v: unknown): string | null {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 19).replace("T", " ") : null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
