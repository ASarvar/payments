import Link from "next/link";
import { Banknote, Hourglass, CircleDashed, ShieldAlert } from "lucide-react";
import { requireAdminPage } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, filterParams, href, type SP } from "@/lib/filters";
import { env } from "@/lib/env";
import {
  addMetrics,
  emptyMetrics,
  getChannelMatrix,
  getDistricts,
  getRegions,
  type ChannelMatrix,
} from "@/server/services/payments";
import { dmy, money, nf, pct1, sum } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";
import { FilterBar } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="To'lovlar taqsimoti" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  // ⚠️ Umumiy ko'rinishda kanal standart sanasi QO'LLANMAYDI (u 12 kanalni birga ko'rsatadi).
  const { f } = parseFilters(sp);

  const [regionsR, districtsR] = await Promise.allSettled([
    getRegions(),
    f.obl !== undefined ? getDistricts(f.obl) : Promise.resolve([]),
  ]);
  const regions = regionsR.status === "fulfilled" ? regionsR.value : [];
  const districts = districtsR.status === "fulfilled" ? districtsR.value : [];
  // Hudud almashganda eski tuman qolib ketgan bo'lsa — tashlanadi (natija jimgina bo'sh chiqmasin).
  if (f.area !== undefined && !districts.some((d) => d.id === f.area)) f.area = undefined;

  let matrix: ChannelMatrix | null = null;
  let error: string | null = null;
  try {
    matrix = await getChannelMatrix(f);
  } catch (e) {
    console.error("[overview]", e);
    error = projectErrorMessage(e);
  }

  const fp = filterParams(f);
  const listHref = (kanal: string, holat: string) => href("/dashboard/royxat", { kanal, holat, ...fp });

  const totals = matrix ? matrix.channels.reduce((acc, c) => addMetrics(acc, c.m), emptyMetrics()) : emptyMetrics();

  return (
    <div>
      <PageHeader
        title="To'lovlar taqsimoti"
        subtitle={
          <>
            12 ta oluvchi kanal bo&apos;yicha · faqat faol yozuvlar (<code>state = 1</code>)
            {matrix?.lastCreated ? <> · oxirgi biriktirish: {dmy(matrix.lastCreated, true)}</> : null}
            {" · "}ko&apos;rsatkichlar {Math.round(env.CACHE_SECONDS / 60)} daqiqagacha keshlanadi
          </>
        }
      />

      <FilterBar
        values={{ dan: f.from, gacha: f.to, hudud: f.obl?.toString(), tuman: f.area?.toString() }}
        resetHref="/dashboard"
        regions={regions.map((r) => ({ value: String(r.id), label: r.name }))}
        districts={districts.map((d) => ({ value: String(d.id), label: d.name }))}
      />

      {error ? <ErrorBox message={error} /> : null}

      {matrix ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Faol to'lovlar"
              {...money(matrix.total.s)}
              footer={`${nf(matrix.total.n)} ta biriktirish`}
              accent="#1a3a7c"
              icon={Banknote}
            />
            <KpiCard
              label="O'tkazilmagan (tasdiqlangan)"
              {...money(totals.otkazilmagan.s)}
              footer="barcha kanallar bo'yicha"
              accent="#c8a96e"
              icon={Hourglass}
            />
            <KpiCard
              label="Tasdiqlanmagan"
              {...money(totals.tasdiqlanmagan.s)}
              footer="hali ko'rib chiqilmagan ulushlar"
              accent="#64748b"
              icon={CircleDashed}
            />
            <KpiCard
              label="Tasdiqlanmasdan o'tkazilgan"
              value={nf(totals.anomaliya.n)}
              unit="ta"
              footer={`${sum(totals.anomaliya.s)} so'm — tekshirish kerak`}
              accent="#b91c1c"
              icon={ShieldAlert}
            />
          </div>

          <Card
            title="Kanallar bo'yicha taqsimot"
            subtitle="Summalar so'mda. Kanal nomini bosing — hududlar kesimi; raqamni bosing — o'sha to'lovlar ro'yxati."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={th}>Kanal</th>
                    <th className={thR}>Hisoblangan</th>
                    <th className={thR}>O&apos;tkazilgan</th>
                    <th className={thR}>Ulushi</th>
                    <th className={thR}>O&apos;tkazilmagan, soni</th>
                    <th className={thR}>O&apos;tkazilmagan, summa</th>
                    <th className={thR}>Tasdiqlanmagan</th>
                    <th className={thR}>Anomaliya</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={totalRow} style={totalStyle}>
                    <td className={td}>J A M I</td>
                    <td className={tdR}>{sum(totals.jami.s)}</td>
                    <td className={tdR}>{sum(totals.otkazilgan.s)}</td>
                    <td className={tdR}>{pct1(totals.otkazilgan.s, totals.jami.s)}</td>
                    <td className={tdR}>{nf(totals.otkazilmagan.n)}</td>
                    <td className={`${tdR} text-red-700`}>{sum(totals.otkazilmagan.s)}</td>
                    <td className={tdR}>{sum(totals.tasdiqlanmagan.s)}</td>
                    <td className={tdR}>{nf(totals.anomaliya.n)}</td>
                  </tr>
                  {matrix.channels.map((c) => {
                    const unused = c.m.jami.n === 0;
                    return (
                      <tr key={c.key} className={`border-b border-border last:border-0 ${unused ? "text-slate-400" : ""}`}>
                        <td className={td}>
                          <Link
                            href={href(`/dashboard/kanal/${c.key}`, { dan: fp.dan, gacha: fp.gacha })}
                            className="font-medium hover:underline"
                            style={unused ? undefined : { color: "var(--cobalt)" }}
                          >
                            {c.label}
                          </Link>
                          {unused ? <span className="ml-2 text-[11px]">(bu davrda yo&apos;q)</span> : null}
                        </td>
                        <td className={tdR}>{sum(c.m.jami.s)}</td>
                        <td className={tdR}>{sum(c.m.otkazilgan.s)}</td>
                        <td className={tdR}>{pct1(c.m.otkazilgan.s, c.m.jami.s)}</td>
                        <td className={tdR}>
                          <Link href={listHref(c.key, "otkazilmagan")} className="hover:underline">
                            {nf(c.m.otkazilmagan.n)}
                          </Link>
                        </td>
                        <td className={`${tdR} font-semibold text-amber-800`}>
                          <Link href={listHref(c.key, "otkazilmagan")} className="hover:underline">
                            {sum(c.m.otkazilmagan.s)}
                          </Link>
                        </td>
                        <td className={tdR}>
                          <Link href={listHref(c.key, "tasdiqlanmagan")} className="hover:underline">
                            {sum(c.m.tasdiqlanmagan.s)}
                          </Link>
                        </td>
                        <td className={tdR}>
                          {c.m.anomaliya.n > 0 ? (
                            <Link href={listHref(c.key, "anomaliya")} className="font-semibold text-red-700 hover:underline">
                              {nf(c.m.anomaliya.n)}
                            </Link>
                          ) : (
                            "0"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <strong>Hisoblangan</strong> = o&apos;tkazilgan + o&apos;tkazilmagan + tasdiqlanmagan.{" "}
            <strong>O&apos;tkazilmagan</strong> — ulush tasdiqlangan, lekin o&apos;tkazildi belgisi yo&apos;q
            (<code>false</code> ham, bo&apos;sh ham). <strong>Anomaliya</strong> — tasdiqlanmasdan o&apos;tkazilgan
            ulush (o&apos;tkazilganlar ichida alohida sanaladi). Ma&apos;lumot <code>project</code> bazasidan faqat
            o&apos;qiladi — bu ilova hech narsani o&apos;zgartirmaydi.
          </p>
        </>
      ) : null}
    </div>
  );
}
