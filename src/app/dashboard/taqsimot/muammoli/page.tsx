import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, filterParams, href, one, type SP } from "@/lib/filters";
import { getDistricts, getRegions, PAGE_SIZE } from "@/server/services/payments";
import {
  PROBLEM_KINDS,
  getProblemPage,
  getProblemSummary,
  isProblemKind,
  type ProblemDoc,
  type ProblemKind,
  type ProblemSummary,
} from "@/server/services/taqsimot";
import { dmy, nf, sum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR } from "@/components/ui";
import { Pager, TaqsimotNav } from "../parts";

const PATH = "/dashboard/taqsimot/muammoli";

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const turRaw = one(sp.tur);
  const kind: ProblemKind = isProblemKind(turRaw) ? turRaw : "taqsimlanmagan";
  const meta = PROBLEM_KINDS.find((k) => k.key === kind) ?? PROBLEM_KINDS[0];
  // Standart sana (`DEFAULT_FROM`) — boshqa sahifalardagi bilan bir xil; bu yerda HUJJAT sanasi bo'yicha.
  const { f, danExplicit } = parseFilters(sp);
  const page = Math.max(1, Number(one(sp.p)) || 1);

  const [regionsR, districtsR] = await Promise.allSettled([
    getRegions(),
    f.obl !== undefined ? getDistricts(f.obl) : Promise.resolve([]),
  ]);
  const regions = regionsR.status === "fulfilled" ? regionsR.value : [];
  const districts = districtsR.status === "fulfilled" ? districtsR.value : [];
  if (f.area !== undefined && !districts.some((d) => d.id === f.area)) f.area = undefined;

  let summary: ProblemSummary | null = null;
  let rows: ProblemDoc[] = [];
  let error: string | null = null;
  let pages = 1;
  let p = 1;
  try {
    summary = await getProblemSummary(f);
    const n = summary.kinds[kind].n;
    pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
    p = Math.min(page, pages);
    rows = n > 0 ? await getProblemPage(kind, f, p) : [];
  } catch (e) {
    console.error("[taqsimot:muammoli]", e);
    error = projectErrorMessage(e);
  }

  const fp = filterParams(f);
  const kindHref = (k: ProblemKind) => href(PATH, { tur: k, ...fp });
  const pageHref = (x: number) => href(PATH, { tur: kind, ...fp, p: x > 1 ? x : undefined });

  return (
    <div>
      <PageHeader
        title="Taqsimot"
        subtitle={
          <>
            Muammoli to&apos;lov hujjatlari · faqat faol kirimlar · hujjat sanasi bo&apos;yicha
            {f.from || f.to ? (
              <>
                {" "}
                · {f.from ? dmy(f.from) : "…"} — {f.to ? dmy(f.to) : "…"}
              </>
            ) : (
              <> · barcha davr</>
            )}
            {!danExplicit ? <> (standart boshlanish sanasi — o&apos;zgartirish mumkin)</> : null}
          </>
        }
      />
      <TaqsimotNav active="muammoli" />

      <FilterBar
        values={{ dan: f.from, gacha: f.to, hudud: f.obl?.toString(), tuman: f.area?.toString() }}
        resetHref={href(PATH, { tur: kind })}
        hidden={{ tur: kind }}
        regions={regions.map((r) => ({ value: String(r.id), label: r.name }))}
        districts={districts.map((d) => ({ value: String(d.id), label: d.name }))}
      />

      {error ? <ErrorBox message={error} /> : null}

      {summary ? (
        <>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            {PROBLEM_KINDS.map((k) => {
              const m = summary.kinds[k.key];
              const on = k.key === kind;
              return (
                <Link
                  key={k.key}
                  href={kindHref(k.key)}
                  className={cn(
                    "block rounded-xl border p-3 transition hover:shadow-sm",
                    on ? "border-[color:var(--cobalt)] bg-card ring-2 ring-cobalt/20" : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  <p className="text-[11.5px] font-medium text-muted-foreground">{k.label}</p>
                  <p className={cn("mt-1 text-lg font-bold", m.n > 0 ? "text-red-700" : "text-slate-700")}>
                    {nf(m.n)} ta{" "}
                    <span className="text-[12px] font-medium text-muted-foreground">
                      · {k.sumLabel}: {sum(m.s)} so&apos;m
                    </span>
                  </p>
                </Link>
              );
            })}
          </div>
          <p className="mb-5 text-[12px] text-muted-foreground">
            Filtrdagi faol hujjatlar: {nf(summary.docs.n)} ta · {sum(summary.docs.s)} so&apos;m. {meta.hint}
          </p>

          <Card title={`${meta.label} — ${nf(summary.kinds[kind].n)} ta`} subtitle="Hujjat ID sini bosing — taqsimot tafsiloti ochiladi.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={th}>Hujjat ID</th>
                    <th className={th}>Sana · №</th>
                    <th className={th}>To&apos;lovchi</th>
                    <th className={th}>Hudud</th>
                    <th className={thR}>Hujjat summasi</th>
                    <th className={thR}>Biriktirilgan</th>
                    <th className={thR}>Farq</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                        Bu filtrda bunday hujjat yo&apos;q.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const diff = r.asum - r.attached;
                      return (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <td className={`${td} tabular-nums`}>
                            <Link href={href("/dashboard/taqsimot", { id: r.id })} className="font-medium hover:underline" style={{ color: "var(--cobalt)" }}>
                              {r.id}
                            </Link>
                          </td>
                          <td className={`${td} whitespace-nowrap tabular-nums`}>
                            {dmy(r.docDate)}
                            <div className="text-[11px] text-muted-foreground">№ {r.docNum ?? "—"}</div>
                          </td>
                          <td className={`${td} max-w-[340px]`}>
                            <div className="line-clamp-2">{r.payer ?? "—"}</div>
                          </td>
                          <td className={td}>
                            <div>{r.region ?? "—"}</div>
                            {r.district ? <div className="text-[12px] text-muted-foreground">{r.district}</div> : null}
                          </td>
                          <td className={tdR}>{sum(r.asum)}</td>
                          <td className={tdR}>
                            {sum(r.attached)}
                            <div className="text-[11px] text-muted-foreground">{nf(r.parts)} ta qism</div>
                          </td>
                          <td className={cn(tdR, "font-semibold", diff < 0 ? "text-red-700" : "text-amber-800")}>
                            {diff < 0 ? "+" : ""}
                            {sum(Math.abs(diff))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Pager page={p} pages={pages} total={summary.kinds[kind].n} pageSize={PAGE_SIZE} hrefFor={pageHref} />
        </>
      ) : null}
    </div>
  );
}
