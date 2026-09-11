import type { Channel } from "@/lib/channels";
import type { PaymentFilters } from "@/server/services/payments";

export type SP = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function int(v: string | undefined): number | undefined {
  if (!v || !/^-?\d{1,9}$/.test(v)) return undefined;
  return Number(v);
}

/**
 * URL → filtr. Parametrlar: `dan`, `gacha` (YYYY-MM-DD), `hudud`, `tuman`.
 *
 * ⚠️ `dan` ning uch holati bor:
 *   - YO'Q (parametr umuman berilmagan) → kanalning standart sanasi (`defaultFrom`,
 *     hozircha faqat QQS);
 *   - BO'SH (`dan=`) → foydalanuvchi sanani ataylab tozalagan, filtr yo'q;
 *   - sana → o'sha sana.
 * Busiz sanani o'chirib bo'lmasdi — standart har safar qaytib kelardi.
 * `danExplicit` havolalar qurishda kerak: standart qiymat BOSHQA kanalga olib o'tilmasin.
 */
export function parseFilters(sp: SP, channel?: Channel): { f: PaymentFilters; danExplicit: boolean } {
  const danRaw = one(sp.dan);
  const danExplicit = danRaw !== undefined;
  const from = danExplicit ? (DATE_RE.test(danRaw) ? danRaw : undefined) : channel?.defaultFrom;
  const gacha = one(sp.gacha);
  const obl = int(one(sp.hudud));
  return {
    f: {
      from,
      to: gacha && DATE_RE.test(gacha) ? gacha : undefined,
      obl,
      // Tuman faqat hudud bilan birga ma'noli.
      area: obl !== undefined ? int(one(sp.tuman)) : undefined,
    },
    danExplicit,
  };
}

/**
 * Filtrni havola parametrlariga aylantiradi. `dan` HAR DOIM beriladi (bo'sh bo'lsa
 * ham) — shunda havola bosilganda standart sana jimgina qo'shilib, son o'zgarib
 * qolmaydi (jadvaldagi son = ro'yxatdagi son).
 */
export function filterParams(f: PaymentFilters): Record<string, string | number | undefined> {
  return { dan: f.from ?? "", gacha: f.to, hudud: f.obl, tuman: f.area };
}

/** Yo'l + parametrlar. `undefined`/`null` tashlanadi, bo'sh satr SAQLANADI (`dan=`). */
export function href(path: string, params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.set(k, String(v));
  }
  const qs = u.toString();
  return qs ? `${path}?${qs}` : path;
}
