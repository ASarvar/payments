import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, href, type SP } from "@/lib/filters";
import { getRegions, type Option } from "@/server/services/payments";
import { BIR_TYPES, birPeriods, getBiriktirish, type BirPeriod, type BirRow } from "@/server/services/taqsimot";
import { dmy, sum, todayTashkent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR } from "@/components/ui";
import { Crumbs, TaqsimotNav } from "../../parts";

const BASE = "/dashboard/taqsimot/biriktirish";

/**
 * Bitta hudud: hisobot davri, joriy oy, kecha, bugun — eski tizimdagi "tushgan mablag'larning
 * taqsimlanishi" jadvali. Har qator respublika jadvali bilan AYNAN bir xil formula (`getBiriktirish`
 * shu hudud bilan). Qator bosilsa — o'sha oraliqdagi hujjatlar.
 */
export default async function BirHududPage({ searchParams }: { searchParams: Promise<SP> }) {
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

  let rows: { p: BirPeriod; r: BirRow }[] | null = null;
  let error: string | null = null;
  if (from && from > to) {
    error = "Boshlanish sanasi oxirgi sanadan keyin — sanalarni tekshiring.";
  } else {
    try {
      const periods = birPeriods(from, to, todayTashkent());
      const res = await Promise.all(periods.map((p) => getBiriktirish(p.from, p.to, region.id)));
      rows = periods.map((p, i) => ({ p, r: res[i][0] }));
    } catch (e) {
      console.error("[taqsimot:biriktirish:hudud]", e);
      error = projectErrorMessage(e);
    }
  }

  const docs = (p: BirPeriod, extra: Record<string, string> = {}) =>
    href(`${BASE}/hujjatlar`, { hudud: region.id, dan: p.from ?? "", gacha: p.to, ...extra });
  const range = (p: BirPeriod) => (p.from === p.to ? dmy(p.to) : `${p.from ? dmy(p.from) : "boshidan"} — ${dmy(p.to)}`);

  return (
    <div>
      <PageHeader
        title="Taqsimot"
        subtitle={
          <>
            {region.name} bo&apos;yicha {from ? dmy(from) : "boshidan"} — {dmy(to)} ijara to&apos;lovlaridan tushgan
            mablag&apos;larning taqsimlanishi
          </>
        }
      />
      <TaqsimotNav active="biriktirish" />
      <Crumbs items={[{ label: "Respublika", href: repHref }, { label: region.name }]} />

      <FilterBar values={{ dan: from, gacha: to }} hidden={{ hudud: String(region.id) }} resetHref={href(`${BASE}/hudud`, { hudud: region.id })} />

      {error ? <ErrorBox message={error} /> : null}

      {rows ? (
        <>
          <Card title={region.name} subtitle="Summalar so'mda · qatorni bosing — o'sha oraliqdagi hujjatlar">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th rowSpan={2} className={th}>
                      Nomi
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
                  {rows.map(({ p, r }) => (
                    <tr key={p.key} className={cn("border-b border-border last:border-0", p.key === "davr" && "bg-muted/30")}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={docs(p)} className="font-medium hover:underline" style={{ color: "var(--cobalt)" }}>
                          {p.label}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">{range(p)}</div>
                      </td>
                      <td className={`${tdR} font-semibold`}>
                        <Link href={docs(p)} className="hover:underline">
                          {sum(r.tushum)}
                        </Link>
                      </td>
                      <td
                        className={cn(tdR, "font-semibold", Math.abs(r.farq) >= 0.5 && "text-red-700")}
                        title={r.farq < 0 ? "Ortiqcha biriktirilgan" : undefined}
                      >
                        <Link href={docs(p, { holat: "biriktirilmagan" })} className="hover:underline">
                          {sum(r.farq)}
                        </Link>
                      </td>
                      <td className={`${tdR} font-semibold`}>{sum(r.biriktirilgan)}</td>
                      {BIR_TYPES.map((t, i) => (
                        <td key={t.key} className={cn(tdR, i === 0 && "border-l border-border")}>
                          {r.types[t.key] ? (
                            <Link href={docs(p, { tur: t.key })} className="hover:underline">
                              {sum(r.types[t.key])}
                            </Link>
                          ) : (
                            "0"
                          )}
                        </td>
                      ))}
                      <td className={tdR}>{sum(r.munis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Qatorlar kesishadi (joriy oy hisobot davri ichida, bugun joriy oy ichida) — shuning uchun JAMI qatori yo&apos;q.
            «Joriy oy», «kecha», «bugun» — oxirgi sanaga ({dmy(to)}) nisbatan. Hisob respublika jadvalidagi bilan bir xil.
          </p>
        </>
      ) : null}
    </div>
  );
}
