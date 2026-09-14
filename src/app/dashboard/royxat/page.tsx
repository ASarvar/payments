import Link from "next/link";
import { FileDown } from "lucide-react";
import { isRegionModerator, requireUserOrRedirect, scopeFilters } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { CHANNELS, HOLATLAR, channelByKey, holatLabel, isHolat, type Holat } from "@/lib/channels";
import { parseFilters, filterParams, href, one, type SP } from "@/lib/filters";
import { withBase } from "@/lib/basePath";
import { env } from "@/lib/env";
import { getDistricts, getRegions, listPayments, rowHolatLabel, PAGE_SIZE, type PaymentRow } from "@/server/services/payments";
import { dmy, nf, sum } from "@/lib/format";
import { FilterBar } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR } from "@/components/ui";

const HOLAT_TONE: Record<string, string> = {
  "O'tkazilgan": "bg-emerald-50 text-emerald-700",
  "O'tkazilmagan": "bg-amber-50 text-amber-800",
  Tasdiqlanmagan: "bg-slate-100 text-slate-600",
  "Tasdiqlanmasdan o'tkazilgan": "bg-red-50 text-red-700",
};

export default async function ListPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Moderatorga ochiq yagona sahifa.
  const user = await requireUserOrRedirect({ moderator: true });
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="To'lovlar ro'yxati" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  const ch = channelByKey(one(sp.kanal)) ?? CHANNELS[0];
  const holatRaw = one(sp.holat);
  // Standart — asosiy savol: "nima tasdiqlangan-u, hali o'tkazilmagan".
  const holat: Holat = isHolat(holatRaw) ? holatRaw : "otkazilmagan";
  // ⚠️ Moderator — faqat o'z hududi (URL'dagi `hudud` e'tiborsiz). Eksport ham xuddi shunday.
  const f = scopeFilters(user, parseFilters(sp).f);
  if (!f) {
    return (
      <>
        <PageHeader title="To'lovlar ro'yxati" />
        <ErrorBox message="Sizga hudud biriktirilmagan — super adminga murojaat qiling." />
      </>
    );
  }
  const q = one(sp.q)?.trim() || undefined;
  const page = Math.max(1, Number(one(sp.p)) || 1);

  const [regionsR, districtsR] = await Promise.allSettled([
    getRegions(),
    f.obl !== undefined ? getDistricts(f.obl) : Promise.resolve([]),
  ]);
  const regions = regionsR.status === "fulfilled" ? regionsR.value : [];
  const districts = districtsR.status === "fulfilled" ? districtsR.value : [];
  if (f.area !== undefined && !districts.some((d) => d.id === f.area)) f.area = undefined;

  // Moderatorga hudud tanlovi o'rniga — qat'iy qiymat.
  const lockedRegion =
    isRegionModerator(user) && f.obl !== undefined
      ? { value: String(f.obl), label: regions.find((r) => r.id === f.obl)?.name ?? `#${f.obl}` }
      : undefined;

  let data: Awaited<ReturnType<typeof listPayments>> | null = null;
  let error: string | null = null;
  try {
    data = await listPayments({ channel: ch.key, holat, f, q }, page);
  } catch (e) {
    console.error("[royxat]", e);
    error = projectErrorMessage(e);
  }

  // ⚠️ Sahifalash va eksport BIR XIL parametrlardan quriladi — yangi filtr qo'shsangiz shu yerga ham.
  const baseParams = { kanal: ch.key, holat, ...filterParams(f), q };
  const pageHref = (p: number) => href("/dashboard/royxat", { ...baseParams, p: p > 1 ? p : undefined });
  const exportHref = withBase(href("/api/export", baseParams));
  const tooBig = data ? data.summary.n > env.EXPORT_MAX_ROWS : false;

  return (
    <div>
      <PageHeader
        title="To'lovlar ro'yxati"
        subtitle={`${ch.label} · ${holatLabel(holat)}${lockedRegion ? ` · ${lockedRegion.label}` : ""}`}
      />

      <FilterBar
        values={{
          kanal: ch.key,
          holat,
          dan: f.from,
          gacha: f.to,
          hudud: f.obl?.toString(),
          tuman: f.area?.toString(),
          q,
        }}
        resetHref="/dashboard/royxat"
        channels={CHANNELS.map((c) => ({ value: c.key, label: c.label }))}
        holatlar={HOLATLAR.map((h) => ({ value: h.key, label: h.label }))}
        regions={lockedRegion ? undefined : regions.map((r) => ({ value: String(r.id), label: r.name }))}
        lockedRegion={lockedRegion}
        districts={districts.map((d) => ({ value: String(d.id), label: d.name }))}
        showQ
      />

      {error ? <ErrorBox message={error} /> : null}

      {data ? (
        <Card
          title={`${nf(data.summary.n)} ta ulush`}
          subtitle={
            <>
              {ch.label} ulushi: <strong>{sum(data.summary.s)}</strong> so&apos;m · to&apos;lovlarning to&apos;liq summasi:{" "}
              {sum(data.summary.asum)} so&apos;m
            </>
          }
          right={
            tooBig ? (
              <span className="text-[12px] text-amber-800">
                Eksport uchun juda ko&apos;p ({nf(env.EXPORT_MAX_ROWS)} dan ortiq) — filtrni toraytiring
              </span>
            ) : (
              <a
                href={exportHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-600 transition hover:bg-muted"
              >
                <FileDown className="h-4 w-4" />
                Excel
              </a>
            )
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={th}>Biriktirish / To&apos;lov ID</th>
                  <th className={th}>To&apos;lov sanasi</th>
                  <th className={th}>Biriktirilgan</th>
                  <th className={th}>Hudud</th>
                  <th className={th}>Shartnoma</th>
                  <th className={th}>Balansda saqlovchi</th>
                  <th className={thR}>Jami summa</th>
                  <th className={thR}>{ch.label} ulushi</th>
                  <th className={th}>Holat</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                      Bu filtrga mos to&apos;lov topilmadi.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => <Row key={r.id} r={r} />)
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {data && data.summary.n > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {nf((data.page - 1) * PAGE_SIZE + 1)}–{nf(Math.min(data.page * PAGE_SIZE, data.summary.n))} / {nf(data.summary.n)}
          </span>
          <div className="flex items-center gap-1.5">
            {data.page > 1 ? (
              <Link href={pageHref(data.page - 1)} className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted">
                ← Oldingi
              </Link>
            ) : null}
            <span className="px-2 text-muted-foreground">
              {nf(data.page)} / {nf(data.pages)}
            </span>
            {data.page < data.pages ? (
              <Link href={pageHref(data.page + 1)} className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted">
                Keyingi →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ r }: { r: PaymentRow }) {
  const h = rowHolatLabel(r);
  return (
    <tr className="border-b border-border last:border-0">
      <td className={`${td} tabular-nums`}>
        <div className="font-medium text-slate-800">{r.id}</div>
        <div className="text-[11px] text-muted-foreground">to&apos;lov #{r.payId ?? "—"}</div>
      </td>
      <td className={`${td} whitespace-nowrap tabular-nums`}>{dmy(r.docDate)}</td>
      <td className={`${td} whitespace-nowrap tabular-nums`}>{dmy(r.createdAt, true)}</td>
      <td className={td}>
        <div>{r.region ?? "—"}</div>
        {r.district ? <div className="text-[12px] text-muted-foreground">{r.district}</div> : null}
      </td>
      <td className={td}>
        {r.hasContract ? (
          r.contractNumber ?? "—"
        ) : (
          <span className="text-[12px] font-medium text-red-700">faol shartnoma topilmadi</span>
        )}
      </td>
      <td className={`${td} max-w-[280px]`}>
        {r.ownerName ? <div className="line-clamp-2">{r.ownerName}</div> : "—"}
        <div className="text-[11px] text-muted-foreground">
          STIR {r.ownerTin ?? "—"} · MFO {r.ownerMfo ?? <span className="text-red-700">yo&apos;q</span>} · h/r{" "}
          {r.ownerAccount ?? <span className="text-red-700">yo&apos;q</span>}
        </div>
      </td>
      <td className={tdR}>{sum(r.asum)}</td>
      <td className={`${tdR} font-semibold`}>{sum(r.share)}</td>
      <td className={td}>
        <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${HOLAT_TONE[h] ?? ""}`}>{h}</span>
      </td>
    </tr>
  );
}
