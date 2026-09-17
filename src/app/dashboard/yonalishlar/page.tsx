import Link from "next/link";
import { Sigma, Landmark, Hourglass } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, filterParams, href, type SP } from "@/lib/filters";
import { getRegions, type PaymentFilters } from "@/server/services/payments";
import { getYonalishlar, type Yonalishlar, type YoRow } from "@/server/services/yonalishlar";
import { PAID_CACHE_SECONDS } from "@/server/services/uzasboSql";
import { dmy, mln, money, nf, pct1, sum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/KpiCard";
import { FilterBar } from "@/components/FilterBar";
import { ExcelLink } from "@/components/ExcelLink";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";

/**
 * YO'NALISHLAR BO'YICHA SVOD: pul qaysi oluvchiga ketishi kerak va qanchasi hali chiqmagan.
 * Ikki jadval — yo'nalishlar (bosqichlar bilan) va yo'nalish × hudud (chiqishi kerak).
 * ⚠️ Tuman kesimi yo'q: manba — hudud × kanal hisobi (nazorat paneli bilan umumiy, keshlangan).
 */
export default async function YonalishlarPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUserOrRedirect(); // faqat adminlar
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="Yo'nalishlar bo'yicha" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  const parsed = parseFilters(sp);
  // Tuman tashlanadi — `payment_items` hudud × kanal hisobida tuman yo'q.
  const f: PaymentFilters = { from: parsed.f.from, to: parsed.f.to, obl: parsed.f.obl };
  const badDates = Boolean(f.from && f.to && f.from > f.to);

  const [regionsR, dataR] = await Promise.allSettled([getRegions(), badDates ? Promise.resolve(null) : getYonalishlar(f)]);
  const regions = regionsR.status === "fulfilled" ? regionsR.value : [];
  if (dataR.status === "rejected") console.error("[yonalishlar]", dataR.reason);
  const d: Yonalishlar | null = dataR.status === "fulfilled" ? dataR.value : null;

  const fp = filterParams(f);
  const listHref = (kanal: string, holat: string) => href("/dashboard/royxat", { kanal, holat, ...fp });
  const scope = f.obl !== undefined ? (regions.find((r) => r.id === f.obl)?.name ?? `#${f.obl}`) : "Respublika";
  const period = `${f.from ? dmy(f.from) : "boshidan"} — ${f.to ? dmy(f.to) : "bugungacha"}`;

  return (
    <div>
      <PageHeader
        title="Yo'nalishlar bo'yicha"
        subtitle={
          <>
            {scope} · to&apos;lov sanasi {period}
            {!parsed.danExplicit ? <> (standart boshlanish sanasi)</> : null}
            {d ? (
              <>
                {" · "}hisoblangan: {dmy(d.computedAt, true)} ({Math.round(PAID_CACHE_SECONDS / 60)} daqiqada yangilanadi)
              </>
            ) : null}
          </>
        }
      />

      <FilterBar
        values={{ dan: f.from, gacha: f.to, hudud: f.obl?.toString() }}
        resetHref="/dashboard/yonalishlar"
        regions={regions.map((r) => ({ value: String(r.id), label: r.name }))}
      />

      {badDates ? <ErrorBox message="Boshlanish sanasi oxirgi sanadan keyin — sanalarni tekshiring." /> : null}
      {dataR.status === "rejected" ? <ErrorBox message={projectErrorMessage(dataR.reason)} /> : null}

      {d ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <KpiCard
              label="Hisoblangan"
              {...money(d.total.m.jami.s)}
              footer={`${nf(d.total.m.jami.n)} ta ulush · 12 yo'nalish`}
              accent="#1a3a7c"
              icon={Sigma}
            />
            <KpiCard
              label="G'aznachilik to'lagan"
              {...money(d.total.m.tolangan.s)}
              footer={`hisoblanganning ${pct1(d.total.m.tolangan.s, d.total.m.jami.s)}`}
              accent="#15803d"
              icon={Landmark}
            />
            <KpiCard
              label="Chiqishi kerak"
              {...money(d.total.qoldiq)}
              footer="hisoblangan − to'langan"
              accent="#b91c1c"
              icon={Hourglass}
            />
          </div>

          <Card
            title="Yo'nalishlar bo'yicha"
            subtitle="Summalar so'mda · «Chiqishi kerak» = hisoblangan − to'langan; o'ng tomondagi uch ustun uning tarkibi · raqamni bosing — ro'yxat"
            right={<ExcelLink href={href("/api/yonalishlar", fp)} />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={th}>Yo&apos;nalish</th>
                    <th className={thR}>Hisoblangan</th>
                    <th className={thR}>To&apos;langan</th>
                    <th className={thR}>Ulushi</th>
                    <th className={`${thR} border-l border-border`}>Chiqishi kerak</th>
                    <th className={thR}>Tasdiqlanmagan</th>
                    <th className={thR}>Tasdiqlangan, kiritilmagan</th>
                    <th className={thR}>Topshiriqnomada</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={totalRow} style={totalStyle}>
                    <td className={td}>{d.total.label}</td>
                    <MainCells r={d.total} list={null} />
                  </tr>
                  {d.rows.map((r) => {
                    const unused = r.m.jami.n === 0;
                    return (
                      <tr key={r.key} className={cn("border-b border-border last:border-0", unused && "text-slate-400")}>
                        <td className={td}>
                          <Link
                            href={href(`/dashboard/kanal/${r.key}`, { dan: fp.dan, gacha: fp.gacha })}
                            className="font-medium hover:underline"
                            style={unused ? undefined : { color: "var(--cobalt)" }}
                          >
                            {r.label}
                          </Link>
                          {unused ? <span className="ml-2 text-[11px]">(bu davrda yo&apos;q)</span> : null}
                        </td>
                        <MainCells r={r} list={(holat) => listHref(r.key, holat)} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Yo'nalish × hudud — chiqishi kerak bo'lgan summa"
            subtitle="Mln so'm · hudud tanlovidan qat'i nazar barcha hududlar · hudud nomini bosing — yuqoridagi jadval shu hududga o'tadi"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={`${th} sticky left-0 bg-muted/50`}>Yo&apos;nalish</th>
                    {d.regions.map((reg) => (
                      <th key={reg.id} className={cn(thR, "whitespace-nowrap")} style={reg.id === f.obl ? totalStyle : undefined}>
                        <Link href={href("/dashboard/yonalishlar", { ...fp, hudud: reg.id })} className="hover:underline">
                          {reg.name}
                        </Link>
                      </th>
                    ))}
                    <th className={`${thR} border-l border-border`}>Jami</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={totalRow} style={totalStyle}>
                    <td className={`${td} sticky left-0`} style={totalStyle}>
                      {d.total.label}
                    </td>
                    {d.regions.map((reg) => (
                      <td key={reg.id} className={tdR}>
                        {mln(d.total.byRegion[reg.id] ?? 0)}
                      </td>
                    ))}
                    <td className={`${tdR} border-l border-border`}>{mln(d.total.qoldiq)}</td>
                  </tr>
                  {d.rows.map((r) => (
                    <tr key={r.key} className="border-b border-border last:border-0">
                      <td className={`${td} sticky left-0 whitespace-nowrap bg-card font-medium`}>
                        <Link
                          href={href(`/dashboard/kanal/${r.key}`, { dan: fp.dan, gacha: fp.gacha })}
                          className="hover:underline"
                          style={{ color: "var(--cobalt)" }}
                        >
                          {r.label}
                        </Link>
                      </td>
                      {d.regions.map((reg) => {
                        const v = r.byRegion[reg.id] ?? 0;
                        return (
                          <td key={reg.id} className={cn(tdR, v === 0 && "text-slate-300")} style={reg.id === f.obl ? totalStyle : undefined}>
                            {mln(v)}
                          </td>
                        );
                      })}
                      <td className={`${tdR} border-l border-border font-semibold`}>{mln(r.qoldiq)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <strong>Yo&apos;nalish</strong> — to&apos;lov taqsimlanadigan oluvchi (QQS, mahalliy budjet, balansda saqlovchi va
            hokazo). <strong>Hisoblangan</strong> — shu yo&apos;nalishga ajratilgan ulush; <strong>to&apos;langan</strong> —
            g&apos;aznachilik ijro etgan topshiriqnomadagi ulush. <strong>Chiqishi kerak</strong> — qolgani:{" "}
            <strong>tasdiqlanmagan</strong> (hali ko&apos;rib chiqilmagan) + <strong>tasdiqlangan, kiritilmagan</strong>{" "}
            (topshiriqnoma tayyorlanmagan) + <strong>topshiriqnomada</strong> (yuborilgan, g&apos;aznachilik hali
            to&apos;lamagan). Hudud kesimida tuman yo&apos;q; ma&apos;lumot <code>project</code> bazasidan faqat o&apos;qiladi.
          </p>
        </>
      ) : null}
    </div>
  );
}

function MainCells({ r, list }: { r: YoRow; list: ((holat: string) => string) | null }) {
  const L = ({ h, children, className }: { h: string; children: React.ReactNode; className?: string }) =>
    list ? (
      <Link href={list(h)} className={cn("hover:underline", className)}>
        {children}
      </Link>
    ) : (
      <span className={className}>{children}</span>
    );
  return (
    <>
      <td className={tdR}>
        <L h="jami">{sum(r.m.jami.s)}</L>
      </td>
      <td className={cn(tdR, r.m.tolangan.s > 0 && "text-emerald-700")}>
        <L h="tolangan">{sum(r.m.tolangan.s)}</L>
      </td>
      <td className={tdR}>{pct1(r.m.tolangan.s, r.m.jami.s)}</td>
      <td className={`${tdR} border-l border-border font-semibold text-red-700`}>{sum(r.qoldiq)}</td>
      <td className={tdR}>
        <L h="tasdiqlanmagan">{sum(r.m.tasdiqlanmagan.s)}</L>
      </td>
      <td className={cn(tdR, "text-amber-800")}>
        <L h="otkazilmagan">{sum(r.m.otkazilmagan.s)}</L>
      </td>
      <td className={tdR}>
        <L h="topshiriqnomada">{sum(r.m.topshiriqnomada.s)}</L>
      </td>
    </>
  );
}
