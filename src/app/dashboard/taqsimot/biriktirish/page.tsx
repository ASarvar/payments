import Link from "next/link";
import type { ReactNode } from "react";
import { Banknote, CalendarDays, CheckCircle2, FileDown, Hourglass } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, href, type SP } from "@/lib/filters";
import { withBase } from "@/lib/basePath";
import { BIR_TYPES, getBiriktirish, totalBir, type BirRow } from "@/server/services/taqsimot";
import { dmy, mln, money, pct1, todayTashkent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/KpiCard";
import { FilterBar } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";
import { TaqsimotNav } from "../parts";

const PATH = "/dashboard/taqsimot/biriktirish";

/** Ko'rsatishda 0,0 ga yaxlitlanadigan farq — rang berilmaydi. */
const isZero = (n: number) => Math.abs(n) < 50_000;

export default async function BiriktirishPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const { f, danExplicit } = parseFilters(sp);
  const from = f.from;
  // `gacha` berilmasa — bugun: "bir kunda" ustunlari shu kun uchun.
  const to = f.to ?? todayTashkent();

  let rows: BirRow[] | null = null;
  let error: string | null = null;
  if (from && from > to) {
    error = "Boshlanish sanasi oxirgi sanadan keyin — sanalarni tekshiring.";
  } else {
    try {
      rows = await getBiriktirish(from, to);
    } catch (e) {
      console.error("[taqsimot:biriktirish]", e);
      error = projectErrorMessage(e);
    }
  }
  const total = rows ? totalBir(rows) : null;
  const period = `${from ? dmy(from) : "boshidan"} — ${dmy(to)}`;
  // Pastki bosqichlarga havolalar — `dan` HAR DOIM beriladi (standart sana jimgina qo'shilmasin).
  const q = { dan: from ?? "", gacha: to };
  const hududHref = (obl: number) => href(`${PATH}/hudud`, { hudud: obl, ...q });
  const docsHref = (obl: number, extra: Record<string, string> = {}) => href(`${PATH}/hujjatlar`, { hudud: obl, ...q, ...extra });

  return (
    <div>
      <PageHeader
        title="Taqsimot"
        subtitle={
          <>
            Ijara to&apos;lovlaridan tushgan mablag&apos;lar biriktirilishining borishi · {period}
            {!danExplicit ? <> (standart boshlanish sanasi — o&apos;zgartirish mumkin)</> : null}
          </>
        }
      />
      <TaqsimotNav active="biriktirish" />

      <FilterBar values={{ dan: from, gacha: to }} resetHref={PATH} />

      {error ? <ErrorBox message={error} /> : null}

      {rows && total ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Tushum" {...money(total.tushum)} footer={period} accent="#1a3a7c" icon={Banknote} />
            <KpiCard
              label="Biriktirilgan"
              {...money(total.biriktirilgan)}
              footer={`tushumning ${pct1(total.biriktirilgan, total.tushum)} · MUNIS orqali ${mln(total.munis)} mln`}
              accent="#15803d"
              icon={CheckCircle2}
            />
            <KpiCard
              label={total.farq < 0 ? "Ortiqcha biriktirilgan" : "Biriktirilmagan"}
              {...money(Math.abs(total.farq))}
              footer="tushum − biriktirilgan"
              accent="#b91c1c"
              icon={Hourglass}
            />
            <KpiCard
              label={`Bir kunda · ${dmy(to)}`}
              {...money(total.day.tushum)}
              footer={`biriktirilgan ${mln(total.day.biriktirilgan)} · biriktirilmagan ${mln(total.day.farq)} mln so'm`}
              accent="#c8a96e"
              icon={CalendarDays}
            />
          </div>

          <Card
            title="Hududlar bo'yicha"
            subtitle={`Summalar mln so'mda · «Bir kunda» — ${dmy(to)} · hudud nomini bosing — davrlar kesimi, raqamni bosing — hujjatlar`}
            right={
              <a
                href={withBase(href("/api/taqsimot/biriktirish", q))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-600 transition hover:bg-muted"
              >
                <FileDown className="h-4 w-4" />
                Excel
              </a>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th rowSpan={2} className={th}>
                      Hudud
                    </th>
                    <th colSpan={3} className={`${th} border-l border-border text-center`}>
                      Bir kunda
                    </th>
                    <th rowSpan={2} className={`${thR} border-l border-border`}>
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
                    <th className={`${thR} border-l border-border`}>Tushum</th>
                    <th className={thR}>Biriktirilgan</th>
                    <th className={thR}>Biriktirilmagan</th>
                    {BIR_TYPES.map((t, i) => (
                      <th key={t.key} className={cn(thR, i === 0 && "border-l border-border")}>
                        {t.label}
                      </th>
                    ))}
                    <th className={thR} title="MUNIS orqali biriktirilgan — asl hisobotda turlarga bo'linmaydi">
                      MUNIS orqali
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={totalRow} style={totalStyle}>
                    <td className={td}>{total.name}</td>
                    <BirCells r={total} />
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id ?? "null"} className="border-b border-border last:border-0">
                      <td className={`${td} whitespace-nowrap font-medium`}>
                        {r.id !== null ? (
                          <Link href={hududHref(r.id)} className="hover:underline" style={{ color: "var(--cobalt)" }}>
                            {r.name}
                          </Link>
                        ) : (
                          r.name
                        )}
                      </td>
                      <BirCells
                        r={r}
                        links={
                          r.id !== null
                            ? {
                                tushum: docsHref(r.id),
                                farq: docsHref(r.id, { holat: "biriktirilmagan" }),
                                day: href(`${PATH}/hujjatlar`, { hudud: r.id, dan: to, gacha: to }),
                              }
                            : undefined
                        }
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <strong>Tushum</strong> — bank to&apos;lov hujjatlari (<code>paydocs</code>), hujjat hududi va sanasi bo&apos;yicha.{" "}
            <strong>Biriktirilgan</strong> — hujjatlardan ajratilgan summa (<code>payments</code>) va MUNIS orqali kelgan
            to&apos;lovlar; <strong>shundan</strong> ustunlari faqat birinchisini turlarga bo&apos;ladi, MUNIS qismi alohida.
            Hisob mavjud tizimdagi hisobot bilan bir xil; farqi — «bir kunda» tanlangan oxirgi sana bo&apos;yicha va doim
            tushum = biriktirilgan + biriktirilmagan. Manfiy biriktirilmagan — ortiqcha biriktirilgan.
          </p>
        </>
      ) : null}
    </div>
  );
}

function BirCells({ r, links }: { r: BirRow; links?: { tushum: string; farq: string; day: string } }) {
  const L = ({ to, children }: { to?: string; children: ReactNode }) =>
    to ? (
      <Link href={to} className="hover:underline">
        {children}
      </Link>
    ) : (
      <>{children}</>
    );
  return (
    <>
      <td className={`${tdR} border-l border-border`}>
        <L to={links?.day}>{mln(r.day.tushum)}</L>
      </td>
      <td className={tdR}>{mln(r.day.biriktirilgan)}</td>
      <td className={cn(tdR, !isZero(r.day.farq) && "text-red-700")}>{mln(r.day.farq)}</td>
      <td className={`${tdR} border-l border-border font-semibold`}>
        <L to={links?.tushum}>{mln(r.tushum)}</L>
      </td>
      <td
        className={cn(tdR, "font-semibold", !isZero(r.farq) && "text-red-700")}
        title={r.farq < 0 ? "Ortiqcha biriktirilgan" : undefined}
      >
        <L to={links?.farq}>{mln(r.farq)}</L>
      </td>
      <td className={`${tdR} font-semibold`}>{mln(r.biriktirilgan)}</td>
      {BIR_TYPES.map((t, i) => (
        <td key={t.key} className={cn(tdR, i === 0 && "border-l border-border")}>
          {mln(r.types[t.key])}
        </td>
      ))}
      <td className={tdR}>{mln(r.munis)}</td>
    </>
  );
}
