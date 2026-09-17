import { CHANNELS } from "@/lib/channels";
import { regionRank } from "@/lib/regions";
import {
  addMetrics,
  emptyMetrics,
  getRegionMatrix,
  getRegions,
  type Metrics,
  type PaymentFilters,
} from "@/server/services/payments";

/**
 * YO'NALISHLAR BO'YICHA SVOD — pul qaysi oluvchiga ketishi kerak va qanchasi hali chiqmagan.
 *
 * ⚠️ Yangi SQL YO'Q: hammasi `getRegionMatrix` (hudud × 12 kanal, nazorat paneli bilan BITTA
 * keshlangan hisob) ustidan yig'iladi — sahifa qo'shimcha yuk bermaydi.
 * "Chiqishi kerak" = hisoblangan − to'langan (foydalanuvchi qarori, 2026-09-16): tasdiqlanmagan +
 * tasdiqlangan-kiritilmagan + topshiriqnomada — uchalasi alohida ustunda.
 */

export interface YoRow {
  key: string;
  label: string;
  m: Metrics;
  /** Chiqishi kerak: hisoblangan − to'langan. */
  qoldiq: number;
  /** Hudud id → chiqishi kerak (hudud filtridan QAT'I NAZAR — barcha hududlar). */
  byRegion: Record<number, number>;
}

export interface YoRegion {
  id: number;
  name: string;
}

export interface Yonalishlar {
  rows: YoRow[];
  total: YoRow;
  /** Ustunlar — ma'lumoti bor hududlar, rasmiy tartibda. */
  regions: YoRegion[];
  computedAt: string;
}

const qoldiqOf = (m: Metrics): number => Math.max(0, m.jami.s - m.tolangan.s);

/** `f.obl` — asosiy jadval shu hudud bo'yicha; hudud kesimi (`byRegion`) doim to'liq. */
export async function getYonalishlar(f: PaymentFilters): Promise<Yonalishlar> {
  const [rm, regionList] = await Promise.all([getRegionMatrix(f.from, f.to), getRegions().catch(() => [])]);
  const names = new Map(regionList.map((r) => [r.id, r.name]));
  const scoped = f.obl !== undefined ? rm.rows.filter((r) => r.id === f.obl) : rm.rows;

  const rows: YoRow[] = CHANNELS.map((ch) => {
    let m = emptyMetrics();
    for (const r of scoped) m = addMetrics(m, r.channels[ch.key]);
    const byRegion: Record<number, number> = {};
    for (const r of rm.rows) {
      if (r.id === null || r.id <= 0) continue;
      byRegion[r.id] = qoldiqOf(r.channels[ch.key]);
    }
    return { key: ch.key, label: ch.label, m, qoldiq: qoldiqOf(m), byRegion };
  });

  const total: YoRow = {
    key: "jami",
    label: "J A M I",
    m: rows.reduce((a, r) => addMetrics(a, r.m), emptyMetrics()),
    qoldiq: rows.reduce((a, r) => a + r.qoldiq, 0),
    byRegion: {},
  };
  for (const r of rows) for (const [id, v] of Object.entries(r.byRegion)) total.byRegion[Number(id)] = (total.byRegion[Number(id)] ?? 0) + v;

  const regions: YoRegion[] = rm.rows
    .filter((r) => r.id !== null && r.id > 0 && (r.total.s > 0 || (total.byRegion[r.id] ?? 0) > 0))
    .map((r) => ({ id: r.id as number, name: names.get(r.id as number) ?? r.name }))
    .sort((a, b) => regionRank(a.id) - regionRank(b.id));

  return { rows, total, regions, computedAt: rm.computedAt };
}
