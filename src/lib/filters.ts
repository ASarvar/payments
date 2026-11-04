import type { PaymentFilters } from "@/server/services/payments";

export type SP = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_FROM = "2025-05-13";

function int(v: string | undefined): number | undefined {
  if (!v || !/^-?\d{1,9}$/.test(v)) return undefined;
  return Number(v);
}

export function parseFilters(sp: SP): { f: PaymentFilters; danExplicit: boolean } {
  const danRaw = one(sp.dan);
  const danExplicit = danRaw !== undefined;
  const from = danExplicit ? (DATE_RE.test(danRaw) ? danRaw : undefined) : DEFAULT_FROM;
  const gacha = one(sp.gacha);
  const obl = int(one(sp.hudud));
  return {
    f: {
      from,
      to: gacha && DATE_RE.test(gacha) ? gacha : undefined,
      obl,
      area: obl !== undefined ? int(one(sp.tuman)) : undefined,
    },
    danExplicit,
  };
}

export function filterParams(f: PaymentFilters): Record<string, string | number | undefined> {
  return { dan: f.from ?? "", gacha: f.to, hudud: f.obl, tuman: f.area };
}

export function href(path: string, params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.set(k, String(v));
  }
  const qs = u.toString();
  return qs ? `${path}?${qs}` : path;
}
