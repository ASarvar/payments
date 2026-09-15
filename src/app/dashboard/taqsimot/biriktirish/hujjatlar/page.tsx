import Link from "next/link";
import { Fragment } from "react";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, href, one, type SP } from "@/lib/filters";
import { PAGE_SIZE, getRegions, type Option } from "@/server/services/payments";
import {
  BIR_DOC_HOLATLAR,
  BIR_TYPES,
  getBirDocPage,
  getBirDocSummary,
  getDistribution,
  isBirDocHolat,
  isBirType,
  type BirDoc,
  type BirDocHolat,
  type BirDocSel,
  type BirDocSummary,
  type Distribution,
} from "@/server/services/taqsimot";
import { dmy, nf, sum, todayTashkent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/FilterBar";
import { ExcelLink } from "@/components/ExcelLink";
import { ClickableRow } from "@/components/ClickableRow";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";
import { ChannelsSubtitle, ChannelsTable, Crumbs, Pager, TaqsimotNav } from "../../parts";

const BASE = "/dashboard/taqsimot/biriktirish";

/**
 * Bitta hudud to'lov hujjatlari va har biriga biriktirilgani (eski tizimdagi "tushgan mablag'larning
 * biriktirilishi" ro'yxati). Hujjat ID si — bizning Taqsimot sahifasi. Bu ilova hech narsani
 * biriktirmaydi — faqat ko'rsatadi.
 */
export default async function BirDocsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUserOrRedirect(); // faqat adminlar
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="Taqsimot" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  const { f } = parseFilters(sp);
  const from = f.from;
  const to = f.to ?? todayTashkent();
  const holatRaw = one(sp.holat);
  const holat: BirDocHolat = isBirDocHolat(holatRaw) ? holatRaw : "hammasi";
  const turRaw = one(sp.tur);
  const tur = isBirType(turRaw) ? turRaw : undefined;
  const page = Math.max(1, Number(one(sp.p)) || 1);

  const regions = await getRegions().catch((): Option[] => []);
  const region = regions.find((r) => r.id === f.obl && r.id > 0);
  const repHref = href(BASE, { dan: from ?? "", gacha: to });
  if (!region) {
    return (
      <>
        <PageHeader title="Taqsimot" />
        <TaqsimotNav active="biriktirish" />
        <ErrorBox message="Hudud tanlanmagan yoki topilmadi." />
        <Link href={repHref} className="text-sm hover:underline" style={{ color: "var(--cobalt)" }}>
          ← Respublika bo&apos;yicha
        </Link>
      </>
    );
  }

  const sel: BirDocSel = { obl: region.id, from, to, holat, tur };
  let summary: BirDocSummary | null = null;
  let docs: BirDoc[] = [];
  let error: string | null = null;
  let pages = 1;
  let p = 1;
  if (from && from > to) {
    error = "Boshlanish sanasi oxirgi sanadan keyin — sanalarni tekshiring.";
  } else {
    try {
      summary = await getBirDocSummary(sel);
      pages = Math.max(1, Math.ceil(summary.n / PAGE_SIZE));
      p = Math.min(page, pages);
      docs = summary.n > 0 ? await getBirDocPage(sel, p) : [];
    } catch (e) {
      console.error("[taqsimot:biriktirish:hujjatlar]", e);
      error = projectErrorMessage(e);
    }
  }

  // Qator bosilganda (`ochiq`) — shu hujjatning kanallar bo'yicha taqsimoti qator ostida (faqat joriy sahifadagisi).
  const ochiqRaw = one(sp.ochiq);
  const ochiq = ochiqRaw && /^\d{1,18}$/.test(ochiqRaw) && docs.some((d) => d.id === ochiqRaw) ? ochiqRaw : undefined;
  let openDist: Distribution | null = null;
  let openError: string | null = null;
  if (ochiq) {
    try {
      openDist = await getDistribution(ochiq);
    } catch (e) {
      console.error("[taqsimot:biriktirish:hujjatlar:ochiq]", e);
      openError = projectErrorMessage(e);
    }
  }

  const base = { hudud: region.id, dan: from ?? "", gacha: to, holat: holat === "hammasi" ? undefined : holat, tur };
  const pageHref = (x: number) => href(`${BASE}/hujjatlar`, { ...base, p: x > 1 ? x : undefined });
  const period = `${from ? dmy(from) : "boshidan"} — ${dmy(to)}`;

  return (
    <div>
      <PageHeader
        title="Taqsimot"
        subtitle={
          <>
            {region.name} bo&apos;yicha {period} ijara to&apos;lovlaridan tushgan mablag&apos;larning biriktirilishi
          </>
        }
      />
      <TaqsimotNav active="biriktirish" />
      <Crumbs
        items={[
          { label: "Respublika", href: repHref },
          { label: region.name, href: href(`${BASE}/hudud`, { hudud: region.id, dan: from ?? "", gacha: to }) },
          { label: "Hujjatlar" },
        ]}
      />

      <FilterBar
        values={{ dan: from, gacha: to, holat }}
        hidden={{ hudud: String(region.id) }}
        holatlar={BIR_DOC_HOLATLAR.map((h) => ({ value: h.key, label: h.label }))}
        selects={[
          {
            name: "tur",
            label: "Turi",
            value: tur ?? "",
            options: [{ value: "", label: "Hammasi" }, ...BIR_TYPES.map((t) => ({ value: t.key, label: t.label }))],
          },
        ]}
        resetHref={href(`${BASE}/hujjatlar`, { hudud: region.id })}
      />

      {error ? <ErrorBox message={error} /> : null}

      {summary ? (
        <>
          <Card
            title={`${nf(summary.n)} ta hujjat`}
            right={<ExcelLink href={href("/api/taqsimot/biriktirish/hujjatlar", base)} />}
            subtitle={
              <>
                Tushum <strong>{sum(summary.tushum)}</strong> · biriktirilgan {sum(summary.biriktirilgan)} · biriktirilmagan{" "}
                <span className={cn(Math.abs(summary.farq) >= 0.5 && "font-semibold text-red-700")}>{sum(summary.farq)}</span>{" "}
                so&apos;m · qatorni bosing — kanallar bo&apos;yicha taqsimot, ID ni bosing — to&apos;liq sahifa
              </>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th rowSpan={2} className={thR}>
                      №
                    </th>
                    <th rowSpan={2} className={th}>
                      Sana
                    </th>
                    <th rowSpan={2} className={th}>
                      ID
                    </th>
                    <th rowSpan={2} className={th}>
                      To&apos;lovchi
                    </th>
                    <th rowSpan={2} className={th}>
                      Maqsadi
                    </th>
                    <th rowSpan={2} className={thR}>
                      Tushum
                    </th>
                    <th rowSpan={2} className={thR}>
                      Biriktirilmagan
                    </th>
                    <th rowSpan={2} className={thR}>
                      Biriktirilgan
                    </th>
                    <th colSpan={BIR_TYPES.length + 1} className={`${th} border-l border-border text-center`}>
                      Shundan
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/50">
                    {BIR_TYPES.map((t, i) => (
                      <th key={t.key} className={cn(thR, i === 0 && "border-l border-border")}>
                        {t.label}
                      </th>
                    ))}
                    <th className={thR}>MUNIS orqali</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={totalRow} style={totalStyle}>
                    <td className={td} />
                    <td className={td} colSpan={4}>
                      J A M I
                    </td>
                    <td className={tdR}>{sum(summary.tushum)}</td>
                    <td className={tdR}>{sum(summary.farq)}</td>
                    <td className={tdR}>{sum(summary.biriktirilgan)}</td>
                    {BIR_TYPES.map((t, i) => (
                      <td key={t.key} className={cn(tdR, i === 0 && "border-l border-border")}>
                        {sum(summary.types[t.key])}
                      </td>
                    ))}
                    <td className={tdR}>{sum(summary.munis)}</td>
                  </tr>
                  {docs.length === 0 ? (
                    <tr>
                      <td colSpan={9 + BIR_TYPES.length} className="px-3 py-10 text-center text-muted-foreground">
                        Bu filtrga mos hujjat yo&apos;q.
                      </td>
                    </tr>
                  ) : (
                    docs.map((d, i) => {
                      const open = d.id === ochiq;
                      const toggle = href(`${BASE}/hujjatlar`, { ...base, p: p > 1 ? p : undefined, ochiq: open ? undefined : d.id });
                      return (
                      <Fragment key={d.id}>
                      <ClickableRow href={toggle} expanded={open} className={cn("border-b border-border last:border-0", open && "bg-muted/40")}>
                        <td className={`${tdR} text-muted-foreground`}>
                          <Link
                            href={toggle}
                            scroll={false}
                            className="inline-flex items-center gap-1 hover:underline"
                            title={open ? "Yopish" : "Kanallar bo'yicha taqsimot"}
                          >
                            <span aria-hidden className="text-[10px]">{open ? "▼" : "▶"}</span>
                            {nf((p - 1) * PAGE_SIZE + i + 1)}
                          </Link>
                        </td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{dmy(d.docDate)}</td>
                        <td className={`${td} tabular-nums`}>
                          <Link href={href("/dashboard/taqsimot", { id: d.id })} className="font-medium hover:underline" style={{ color: "var(--cobalt)" }}>
                            {d.id}
                          </Link>
                          {d.docNum ? <div className="text-[11px] text-muted-foreground">№ {d.docNum}</div> : null}
                        </td>
                        <td className={`${td} min-w-[200px] max-w-[260px]`}>
                          <div className="line-clamp-3">{d.payer ?? "—"}</div>
                        </td>
                        <td className={`${td} min-w-[280px] max-w-[440px]`}>
                          <div className="line-clamp-3 text-[12px]" title={d.note ?? undefined}>
                            {d.note ?? "—"}
                          </div>
                        </td>
                        <td className={`${tdR} font-semibold`}>{sum(d.tushum)}</td>
                        <td
                          className={cn(tdR, "font-semibold", Math.abs(d.farq) >= 0.5 && "text-red-700")}
                          title={d.farq < 0 ? "Ortiqcha biriktirilgan" : undefined}
                        >
                          {sum(d.farq)}
                        </td>
                        <td className={tdR}>{sum(d.biriktirilgan)}</td>
                        {BIR_TYPES.map((t, j) => (
                          <td key={t.key} className={cn(tdR, j === 0 && "border-l border-border", !d.types[t.key] && "text-slate-300")}>
                            {sum(d.types[t.key])}
                          </td>
                        ))}
                        <td className={cn(tdR, !d.munis && "text-slate-300")}>{sum(d.munis)}</td>
                      </ClickableRow>
                      {open ? (
                        <tr className="border-b border-border bg-muted/20">
                          <td colSpan={9 + BIR_TYPES.length} className="p-0">
                            {/* sticky — keng jadval yon tomonga surilganda ham panel ko'rinib turadi */}
                            <div className="sticky left-0 max-w-[calc(100vw-3rem)] p-3 md:max-w-[calc(100vw-20rem)]">
                              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                                  <div>
                                    <p className="text-[13px] font-semibold" style={{ color: "var(--navy)" }}>
                                      Kanallar bo&apos;yicha — hujjat #{d.id}
                                    </p>
                                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                                      {openDist ? <ChannelsSubtitle d={openDist} /> : (openError ?? "Hujjat topilmadi.")}
                                    </p>
                                  </div>
                                  <Link
                                    href={href("/dashboard/taqsimot", { id: d.id })}
                                    className="text-[12.5px] font-medium hover:underline"
                                    style={{ color: "var(--cobalt)" }}
                                  >
                                    To&apos;liq taqsimot (qismlar, topshiriqnomalar) →
                                  </Link>
                                </div>
                                {openDist ? <ChannelsTable d={openDist} /> : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Pager page={p} pages={pages} total={summary.n} pageSize={PAGE_SIZE} hrefFor={pageHref} />

          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            Har hujjatga biriktirilgan — unga bog&apos;langan ajratmalar (<code>payments</code>) va MUNIS to&apos;lovlari
            (<code>pay_id</code> orqali). Bu ilova hech narsani biriktirmaydi — faqat ko&apos;rsatadi.
          </p>
        </>
      ) : null}
    </div>
  );
}
