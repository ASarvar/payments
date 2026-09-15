import { Banknote, CheckCircle2, FileText, Scale, Search } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { href, one, type SP } from "@/lib/filters";
import { FIRST_YEAR, getShartnomalar, totalSh, type ShRow, type ShTriple } from "@/server/services/shartnomalar";
import { dmy, mln, money, nf, pct1, todayTashkent } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";
import { ExcelLink } from "@/components/ExcelLink";
import { inputCls, labelCls } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";

const groupTh = `${th} border-l border-border text-center`;

export default async function ShartnomalarPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Hozircha faqat adminlar — moderator ro'yxatga yuboriladi.
  await requireUserOrRedirect();
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="Shartnomalar bo'yicha" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  const today = todayTashkent();
  const thisYear = Number(today.slice(0, 4));
  const y = Number(one(sp.yil));
  const year = Number.isInteger(y) && y >= FIRST_YEAR && y <= thisYear ? y : thisYear;
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);

  let rows: ShRow[] | null = null;
  let error: string | null = null;
  try {
    rows = await getShartnomalar(year, today);
  } catch (e) {
    console.error("[shartnomalar]", e);
    error = projectErrorMessage(e);
  }
  const total = rows ? totalSh(rows) : null;

  return (
    <div>
      <PageHeader title="Shartnomalar bo'yicha" subtitle={`${year} yilda hisoblangan ijara to'lovlari va penyalar · respublika bo'yicha`} />

      <form className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Yil</span>
          <select key={year} name="yil" defaultValue={String(year)} className={inputCls}>
            {years.map((v) => (
              <option key={v} value={v}>
                {v} yil
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          style={{ background: "var(--cobalt)" }}
        >
          <Search className="h-4 w-4" />
          Ko&apos;rsatish
        </button>
      </form>

      {error ? <ErrorBox message={error} /> : null}

      {rows && total ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Shartnomalar" value={nf(total.count)} unit="ta" footer={`summasi ${mln(total.sum)} mln so'm`} accent="#1a3a7c" icon={FileText} />
            <KpiCard
              label="Hisoblangan"
              {...money(total.hisob.jami)}
              footer={`ijara ${mln(total.hisob.rent)} · penya ${mln(total.hisob.penya)} mln`}
              accent="#2563eb"
              icon={Banknote}
            />
            <KpiCard
              label="To'langan"
              {...money(total.paid.jami)}
              footer={`hisoblanganning ${pct1(total.paid.jami, total.hisob.jami)} · bugun ${mln(total.day.jami)} mln`}
              accent="#15803d"
              icon={CheckCircle2}
            />
            <KpiCard
              label="Debitor qarz"
              {...money(total.debitor.jami)}
              footer={`kreditor ${mln(total.creditor)} mln so'm`}
              accent="#b91c1c"
              icon={Scale}
            />
          </div>

          <Card
            title="Hududlar bo'yicha"
            subtitle={`Summalar mln so'mda · «bir kunda» — bugun (${dmy(today)})`}
            right={<ExcelLink href={href("/api/shartnomalar", { yil: year })} />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th rowSpan={2} className={th}>
                      Hudud
                    </th>
                    <th colSpan={2} className={groupTh}>
                      Shartnomalar
                    </th>
                    <th colSpan={3} className={groupTh}>
                      Hisoblandi
                    </th>
                    <th colSpan={3} className={groupTh}>
                      To&apos;landi · bir kunda
                    </th>
                    <th colSpan={3} className={groupTh}>
                      To&apos;landi · hisobot davrida
                    </th>
                    <th colSpan={3} className={groupTh}>
                      Debitor qarz
                    </th>
                    <th rowSpan={2} className={`${thR} border-l border-border`}>
                      Kreditor
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={`${thR} border-l border-border`}>Soni</th>
                    <th className={thR}>Summasi</th>
                    {[0, 1, 2, 3].map((g) => (
                      <TripleHead key={g} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className={totalRow} style={totalStyle}>
                    <td className={td}>{total.name}</td>
                    <ShCells r={total} />
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id ?? "null"} className="border-b border-border last:border-0">
                      <td className={`${td} whitespace-nowrap font-medium`}>{r.name}</td>
                      <ShCells r={r} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <strong>Shartnomalar</strong> — {year} yilgi faol, tasdiqlangan shartnomalar (1 va 2-tur). <strong>Hisoblandi</strong> —
            yil hisob-kitobi (ijara va penya). <strong>To&apos;landi</strong> — shu yilga biriktirilgan ijara va penya
            to&apos;lovlari («bir kunda» — bugungi). <strong>Debitor</strong> — shartnomalar bo&apos;yicha qarz, <strong>kreditor</strong>{" "}
            — ortiqcha to&apos;langan. Hisob mavjud tizimdagi hisobot bilan bir xil.
          </p>
        </>
      ) : null}
    </div>
  );
}

function TripleHead() {
  return (
    <>
      <th className={`${thR} border-l border-border`}>Jami</th>
      <th className={thR}>Ijara</th>
      <th className={thR}>Penya</th>
    </>
  );
}

function Triple({ t, strong }: { t: ShTriple; strong?: boolean }) {
  return (
    <>
      <td className={`${tdR} border-l border-border ${strong ? "font-semibold" : ""}`}>{mln(t.jami)}</td>
      <td className={tdR}>{mln(t.rent)}</td>
      <td className={tdR}>{mln(t.penya)}</td>
    </>
  );
}

function ShCells({ r }: { r: ShRow }) {
  return (
    <>
      <td className={`${tdR} border-l border-border`}>{nf(r.count)}</td>
      <td className={tdR}>{mln(r.sum)}</td>
      <Triple t={r.hisob} strong />
      <Triple t={r.day} />
      <Triple t={r.paid} strong />
      <td className={`${tdR} border-l border-border font-semibold text-red-700`}>{mln(r.debitor.jami)}</td>
      <td className={tdR}>{mln(r.debitor.rent)}</td>
      <td className={tdR}>{mln(r.debitor.penya)}</td>
      <td className={`${tdR} border-l border-border`}>{mln(r.creditor)}</td>
    </>
  );
}
