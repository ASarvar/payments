import { dmy, mln, nf } from "@/lib/format";
import type { DayPoint } from "@/server/services/nazorat";

/**
 * Kunlik dinamika grafigi — SERVERDA chiziladigan SVG (kutubxonasiz, JS'siz). Ustun ustiga kelinsa
 * (`<title>`) o'sha kun raqamlari chiqadi. ⚠️ Faqat server komponentda (`nf` — `lib/format.ts`).
 */

const W = 760;
const H = 240;
const PAD = { l: 50, r: 10, t: 12, b: 28 };
export const SERIES = {
  tushum: { label: "Tushum", color: "#9fb3d9" },
  biriktirilgan: { label: "Biriktirilgan", color: "#c8a96e" },
  tolangan: { label: "G'aznachilik to'lagan", color: "#15803d" },
} as const;

/** 1 · 2 · 2,5 · 5 · 10 × 10ⁿ — o'qda "yumaloq" chegara. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e;
}

export function DayChart({ points }: { points: DayPoint[] }) {
  if (points.length === 0) return null;
  const max = niceMax(Math.max(0, ...points.flatMap((p) => [p.tushum, p.biriktirilgan, p.tolangan])));
  const unit = max >= 1e10 ? { div: 1e9, label: "mlrd" } : { div: 1e6, label: "mln" };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const step = plotW / points.length;
  const bw = Math.max(2, step * 0.34);
  const y = (v: number) => PAD.t + plotH * (1 - v / max);
  const cx = (i: number) => PAD.l + step * i + step / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  const tickLabel = (v: number) => nf(v / unit.div, v / unit.div < 10 && v > 0 ? 1 : 0);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(p.tolangan).toFixed(1)}`).join(" ");
  const labelEvery = points.length > 20 ? 5 : points.length > 10 ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full min-w-[560px]"
      role="img"
      aria-label={`Kunlik tushum, biriktirilgan va g'aznachilik to'lagan summa, ${unit.label} so'm`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#64748b">
            {tickLabel(t)}
          </text>
        </g>
      ))}
      <text x={4} y={PAD.t + 4} fontSize={9.5} fill="#94a3b8">
        {unit.label}
      </text>

      {points.map((p, i) => {
        const x0 = cx(i) - bw - 0.5;
        return (
          <g key={p.d}>
            <title>
              {`${dmy(p.d)}\nTushum: ${mln(p.tushum)} mln\nBiriktirilgan: ${mln(p.biriktirilgan)} mln\nG'aznachilik to'lagan: ${mln(p.tolangan)} mln`}
            </title>
            {/* Butun ustun — sichqoncha uchun nishon (izoh har joyda chiqsin). */}
            <rect x={PAD.l + step * i} y={PAD.t} width={step} height={plotH} fill="transparent" />
            <rect x={x0} y={y(p.tushum)} width={bw} height={Math.max(0, PAD.t + plotH - y(p.tushum))} fill={SERIES.tushum.color} rx={1} />
            <rect
              x={x0 + bw + 1}
              y={y(p.biriktirilgan)}
              width={bw}
              height={Math.max(0, PAD.t + plotH - y(p.biriktirilgan))}
              fill={SERIES.biriktirilgan.color}
              rx={1}
            />
            {i % labelEvery === 0 || i === points.length - 1 ? (
              <text x={cx(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">
                {dmy(p.d).slice(0, 5)}
              </text>
            ) : null}
          </g>
        );
      })}

      <path d={line} fill="none" stroke={SERIES.tolangan.color} strokeWidth={2} strokeLinejoin="round" pointerEvents="none" />
      {points.map((p, i) => (
        <circle key={p.d} cx={cx(i)} cy={y(p.tolangan)} r={2.4} fill={SERIES.tolangan.color} pointerEvents="none" />
      ))}
    </svg>
  );
}
