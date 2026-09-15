import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { href, one, type SP } from "@/lib/filters";
import { PAGE_SIZE } from "@/server/services/payments";
import { getDoublePaid, type DoublePaid } from "@/server/services/taqsimot";
import { dmy, nf, sum } from "@/lib/format";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR } from "@/components/ui";
import { Pager, TaqsimotNav } from "../parts";

const PATH = "/dashboard/taqsimot/takroriy";

export default async function DoublePaidPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const page = Math.max(1, Number(one(sp.p)) || 1);

  let rows: DoublePaid[] | null = null;
  let truncated = false;
  let error: string | null = null;
  try {
    const r = await getDoublePaid();
    rows = r.rows;
    truncated = r.truncated;
  } catch (e) {
    console.error("[taqsimot:takroriy]", e);
    error = projectErrorMessage(e);
  }

  const all = rows ?? [];
  const extra = all.reduce((a, r) => a + r.extra, 0);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const p = Math.min(page, pages);
  const pageRows = all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Taqsimot"
        subtitle="Balansda saqlovchi ulushi g'aznachilikda 2 va undan ko'p marta to'langan qismlar · 1 soatgacha keshlanadi"
      />
      <TaqsimotNav active="takroriy" />

      {error ? <ErrorBox message={error} /> : null}

      {rows ? (
        <>
          {truncated ? (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Natija juda ko&apos;p — faqat ortiqcha summasi eng kattalari ko&apos;rsatilgan ({nf(all.length)} ta).
            </p>
          ) : null}

          <Card
            title={`${nf(all.length)} ta qism · ortiqcha to'langan: ${sum(extra)} so'm`}
            subtitle="Ortiqcha = to'langan topshiriqnomalar summasi − ulush. Qonuniy holat ham bo'lishi mumkin (masalan, ulush bo'lib to'langan) — hujjat sahifasida tekshiring."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={th}>Biriktirish ID</th>
                    <th className={th}>Hujjat</th>
                    <th className={th}>Hudud</th>
                    <th className={th}>Shartnoma · balansda saqlovchi</th>
                    <th className={thR}>Ulush</th>
                    <th className={thR}>Marta</th>
                    <th className={thR}>To&apos;langan jami</th>
                    <th className={thR}>Ortiqcha</th>
                    <th className={th}>Topshiriqnomalar</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                        Ikki marta to&apos;langan ulush topilmadi.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r) => (
                      <tr key={r.itemId} className="border-b border-border last:border-0">
                        <td className={`${td} tabular-nums`}>{r.itemId}</td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>
                          {r.payId ? (
                            <Link
                              href={href("/dashboard/taqsimot", { id: r.payId, qism: r.itemId })}
                              className="font-medium hover:underline"
                              style={{ color: "var(--cobalt)" }}
                            >
                              #{r.payId}
                            </Link>
                          ) : (
                            "—"
                          )}
                          <div className="text-[11px] text-muted-foreground">{dmy(r.docDate)}</div>
                        </td>
                        <td className={td}>{r.region ?? "—"}</td>
                        <td className={`${td} max-w-[280px]`}>
                          <div>{r.contractNumber ?? "—"}</div>
                          {r.ownerName ? <div className="line-clamp-2 text-[12px] text-muted-foreground">{r.ownerName}</div> : null}
                        </td>
                        <td className={tdR}>{sum(r.share)}</td>
                        <td className={`${tdR} font-semibold`}>{nf(r.times)}</td>
                        <td className={tdR}>{sum(r.paidTotal)}</td>
                        <td className={`${tdR} font-semibold text-red-700`}>{sum(r.extra)}</td>
                        <td className={`${td} max-w-[200px] break-words text-[12px] tabular-nums text-muted-foreground`}>
                          {r.sends.map((s) => `#${s}`).join(", ")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Pager page={p} pages={pages} total={all.length} pageSize={PAGE_SIZE} hrefFor={(x) => href(PATH, { p: x > 1 ? x : undefined })} />

          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            <strong>Nega faqat balansda saqlovchi:</strong> uning har bir topshiriqnomasida bitta qism bo&apos;ladi va summa
            aynan shu qism ulushiga teng. Boshqa kanallarda (QQS, mahalliy budjet, Markaz, PF-16, …) topshiriqnoma ro&apos;yxati
            ko&apos;pincha davr boshidan to&apos;planadi — bitta qism o&apos;nlab topshiriqnomada qayta keltiriladi, summa esa faqat
            yangi qismlar uchun to&apos;lanadi. Shuning uchun ular bo&apos;yicha ikki marta to&apos;lashni ro&apos;yxatdan aniqlab
            bo&apos;lmaydi.
          </p>
        </>
      ) : null}
    </div>
  );
}
