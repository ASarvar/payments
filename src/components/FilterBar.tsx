import { Search, RotateCcw } from "lucide-react";
import { withBase } from "@/lib/basePath";

interface Opt {
  value: string;
  label: string;
}

const inputCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/20";
const labelCls = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/**
 * Oddiy GET forma (JS'siz ishlaydi). Faqat berilgan maydonlar chiziladi.
 *
 * ⚠️ `action` ATAYLAB berilmagan — GET forma joriy URL'ga yuboradi va production'dagi
 * `/payments` sub-path'i saqlanadi.
 * ⚠️ Bo'sh `dan` ham yuboriladi (`dan=`) — bu "sanani ataylab tozaladim" degani
 * (`lib/filters.ts`), aks holda standart sana (`DEFAULT_FROM`) har safar qaytib kelardi.
 * ⚠️ Hudud o'zgarganda eski tuman qolib ketishi mumkin — sahifa uni o'sha hudud
 * tumanlari ro'yxatiga qarab tekshiradi va mos kelmasa tashlaydi.
 * `lockedRegion` — hudud moderatori uchun: tanlov o'rniga qat'iy qiymat (yashirin `hudud`
 * yuboriladi, aks holda tuman filtri ishlamasdi). Cheklovni server baribar majburlaydi.
 */
export function FilterBar({
  values,
  resetHref,
  regions,
  districts,
  channels,
  holatlar,
  showQ,
  hidden,
  lockedRegion,
  children,
}: {
  values: { dan?: string; gacha?: string; hudud?: string; tuman?: string; kanal?: string; holat?: string; q?: string };
  resetHref: string;
  regions?: Opt[];
  districts?: Opt[];
  channels?: Opt[];
  holatlar?: Opt[];
  showQ?: boolean;
  hidden?: Record<string, string>;
  lockedRegion?: Opt;
  children?: React.ReactNode;
}) {
  return (
    <form className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}

      {channels ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Kanal</span>
          <select name="kanal" defaultValue={values.kanal ?? ""} className={inputCls}>
            {channels.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {holatlar ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Holat</span>
          <select name="holat" defaultValue={values.holat ?? ""} className={`${inputCls} max-w-[260px]`}>
            {holatlar.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className={labelCls}>To&apos;lov sanasi</span>
        <div className="flex items-center gap-1">
          <input type="date" name="dan" defaultValue={values.dan ?? ""} className={inputCls} />
          <span className="text-muted-foreground">—</span>
          <input type="date" name="gacha" defaultValue={values.gacha ?? ""} className={inputCls} />
        </div>
      </label>

      {lockedRegion ? (
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Hudud</span>
          <input type="hidden" name="hudud" value={lockedRegion.value} />
          <span className={`${inputCls} max-w-[220px] cursor-default truncate bg-slate-50 text-slate-600`}>{lockedRegion.label}</span>
        </div>
      ) : regions ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Hudud</span>
          <select name="hudud" defaultValue={values.hudud ?? ""} className={`${inputCls} max-w-[200px]`}>
            <option value="">Hammasi</option>
            {regions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {districts && districts.length > 0 ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Tuman</span>
          <select name="tuman" defaultValue={values.tuman ?? ""} className={`${inputCls} max-w-[200px]`}>
            <option value="">Hammasi</option>
            {districts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showQ ? (
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className={labelCls}>Qidiruv</span>
          <input
            type="text"
            name="q"
            defaultValue={values.q ?? ""}
            placeholder="Shartnoma raqami, BS STIR, to'lov yoki biriktirish ID"
            className={inputCls}
          />
        </label>
      ) : null}

      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        style={{ background: "var(--cobalt)" }}
      >
        <Search className="h-4 w-4" />
        Qo&apos;llash
      </button>
      {/* ⚠️ Oddiy <a> — Link EMAS: to'liq yuklash inputlarni tozalaydi (defaultValue client
          navigatsiyada yangilanmaydi). Shuning uchun basePath QO'LDA (`withBase`). */}
      <a
        href={withBase(resetHref)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-600 transition hover:bg-muted"
      >
        <RotateCcw className="h-4 w-4" />
        Tozalash
      </a>
      {children}
    </form>
  );
}
