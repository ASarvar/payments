import Link from "next/link";
import { AlertTriangle, Ban, Banknote, CheckCircle2, Link2Off, Search } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage, projectWriteConfigured } from "@/lib/projectDb";
import { href, one, type SP } from "@/lib/filters";
import { dmy, money, nf, sum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { findItem, type CancelTarget } from "@/server/services/pulBiriktirish";
import { cancelAttachmentAction } from "./actions";
import { KpiCard } from "@/components/KpiCard";
import { inputCls, labelCls } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";

const PATH = "/dashboard/pul-biriktirish";

export default async function PulBiriktirishPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUserOrRedirect();
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="Pul biriktirish" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  const idRaw = one(sp.id)?.trim() ?? "";
  const natija = one(sp.natija);
  const sabab = one(sp.sabab);
  const yozuvBor = projectWriteConfigured();

  let item: CancelTarget | null = null;
  let error: string | null = null;
  let notFound = false;
  if (idRaw) {
    if (!/^\d{1,18}$/.test(idRaw)) {
      error = "ID faqat raqamlardan iborat bo'lishi kerak.";
    } else {
      try {
        item = await findItem(idRaw);
        notFound = item === null;
      } catch (e) {
        console.error("[pul-biriktirish:sahifa]", e);
        error = projectErrorMessage(e);
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Pul biriktirish"
        subtitle="Biriktirish (to'lov qismi) ID si bo'yicha — shartlarni tekshirib, birikishni bekor qilish"
      />

      <form className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span className={labelCls}>Biriktirish ID si (payment_items.id)</span>
          <input type="text" name="id" defaultValue={idRaw} inputMode="numeric" placeholder="masalan 1361298115" className={inputCls} autoFocus />
        </label>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          style={{ background: "var(--cobalt)" }}
        >
          <Search className="h-4 w-4" />
          Tekshirish
        </button>
      </form>

      {natija === "ok" ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Biriktirish <strong>#{idRaw}</strong> bekor qilindi — qism endi faol emas (<code>state = 0</code>) va
            hisobotlarga kirmaydi. Pul hujjat bo'yicha biriktirilmagan qoldiqqa qaytadi.
          </p>
        </div>
      ) : null}
      {natija === "xato" ? <ErrorBox message={sabab ?? "Bekor qilib bo'lmadi."} /> : null}
      {error ? <ErrorBox message={error} /> : null}
      {notFound ? <ErrorBox message={`#${idRaw} — bunday biriktirish topilmadi.`} /> : null}

      {!yozuvBor ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Bekor qilish o&apos;chiq</p>
            <p className="mt-1">
              Yozuv ulanishi sozlanmagan (<code>PROJECT_WRITE_DATABASE_URL</code>) — sahifa faqat tekshiradi.
              Serverda rol va huquq berilishi kerak (DEPLOY.md §7).
            </p>
          </div>
        </div>
      ) : null}

      {item ? <ItemView item={item} yozuvBor={yozuvBor} /> : null}

      {!idRaw ? (
        <Card title="Qanday ishlaydi" subtitle="Bu sahifa to'lovni shartnomaga biriktirishni bekor qiladi">
          <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-slate-700">
            <p>
              <strong>1.</strong> Biriktirish ID sini kiriting — bu <code>payment_items</code> jadvalidagi qism raqami
              (&quot;To&apos;lovlar ro&apos;yxati&quot;dagi birinchi ustun).
            </p>
            <p>
              <strong>2.</strong> Ilova qismning summasi va 12 kanalga bo&apos;linishini ko&apos;rsatadi hamda har bir
              kanal uchun pul topshiriqnomaga kiritilgan-kiritilmaganini tekshiradi.
            </p>
            <p>
              <strong>3.</strong> Summasi noldan katta kanallarning birortasi ham topshiriqnomaga kiritilmagan
              bo&apos;lsa, birikishni bekor qilish mumkin: qism <code>state = 0</code> bo&apos;ladi va hisobotlardan
              chiqadi. Aks holda tugma ochilmaydi.
            </p>
            <p className="text-muted-foreground">
              Har bir urinish auditga yoziladi. Bekor qilingan qismni qaytarish bu yerda emas — baza yoki eski tizim
              orqali tuzatiladi.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ItemView({ item, yozuvBor }: { item: CancelTarget; yozuvBor: boolean }) {
  const shares = item.shares.filter((s) => s.sum > 0);
  const ok = item.canCancel;
  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Biriktirilgan summa" {...money(item.asum)} footer={`to'lov sanasi ${dmy(item.docDate)}`} accent="#1a3a7c" icon={Banknote} />
        <KpiCard
          label="Holati"
          value={item.active ? "Faol" : "Faol emas"}
          unit={item.active ? undefined : `state = ${item.state}`}
          footer={item.active ? "hisobotlarga kiradi" : "hisobotlarga kirmaydi"}
          accent={item.active ? "#15803d" : "#64748b"}
          icon={item.active ? CheckCircle2 : Ban}
        />
        <KpiCard
          label="Kanallarga bo'lingan"
          {...money(item.sharesSum)}
          footer={`${nf(shares.length)} ta kanal`}
          accent="#2563eb"
          icon={Banknote}
        />
        <KpiCard
          label={ok ? "Bekor qilish mumkin" : "Bekor qilib bo'lmaydi"}
          value={ok ? "Ha" : "Yo'q"}
          footer={ok ? "hech bir ulush topshiriqnomaga kiritilmagan" : (item.active ? `to'siq: ${item.blockers.join(", ")}` : "qism allaqachon faol emas")}
          accent={ok ? "#15803d" : "#b91c1c"}
          icon={ok ? CheckCircle2 : Ban}
        />
      </div>

      <Card
        title={`Biriktirish #${item.id}`}
        subtitle={
          <>
            To&apos;lov hujjati{" "}
            {item.payId ? (
              <Link href={href("/dashboard/taqsimot", { id: item.payId, qism: item.id })} className="hover:underline" style={{ color: "var(--cobalt)" }}>
                #{item.payId}
              </Link>
            ) : (
              "—"
            )}
            {item.docNum ? ` · № ${item.docNum}` : null} · {item.region ?? "hudud yo'q"}
            {item.district ? ` · ${item.district}` : null}
          </>
        }
      >
        <dl className="grid gap-x-8 gap-y-3 px-4 py-3 text-[13px] md:grid-cols-2">
          <Field label="Shartnoma" value={item.contractNumber ? `${item.contractNumber}${item.contractActive ? "" : " (faol emas)"}` : "topilmadi"} />
          <Field label="Balansda saqlovchi" value={item.ownerName ? `${item.ownerName} · STIR ${item.ownerTin ?? "—"}` : "—"} />
          <Field label="To'lovchi" value={item.docPayer} wide />
          <Field label="Biriktirilgan vaqti" value={dmy(item.createdAt, true)} />
          <Field label="Oxirgi yangilanish" value={dmy(item.updatedAt, true)} />
        </dl>
      </Card>

      <Card
        title="Kanallar bo'yicha tekshiruv"
        subtitle="Summasi noldan katta kanalning topshiriqnomaga kiritilgani (sent) bekor qilishga to'sqinlik qiladi"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={th}>Kanal</th>
                <th className={thR}>Summa</th>
                <th className={th}>Tasdiqlangan</th>
                <th className={th}>Topshiriqnomaga kiritilgan</th>
                <th className={th}>Xulosa</th>
              </tr>
            </thead>
            <tbody>
              <tr className={totalRow} style={totalStyle}>
                <td className={td}>J A M I</td>
                <td className={tdR}>{sum(item.sharesSum)}</td>
                <td className={td} />
                <td className={td} />
                <td className={td}>{ok ? "to'siq yo'q" : item.blockers.length > 0 ? `${item.blockers.length} ta to'siq` : "faol emas"}</td>
              </tr>
              {shares.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Birorta kanalga ulush ajratilmagan.
                  </td>
                </tr>
              ) : null}
              {shares.map((s) => (
                <tr key={s.key} className={cn("border-b border-border last:border-0", s.blocker && "bg-red-50/60")}>
                  <td className={`${td} font-medium`}>{s.label}</td>
                  <td className={tdR}>{sum(s.sum)}</td>
                  <td className={td}>{s.accepted === true ? "ha" : s.accepted === false ? "yo'q" : "—"}</td>
                  <td className={cn(td, s.blocker && "font-semibold text-red-700")}>{s.sent === true ? "HA" : s.sent === false ? "yo'q" : "—"}</td>
                  <td className={td}>
                    {s.blocker ? (
                      <span className="inline-block whitespace-nowrap rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        to&apos;siq
                      </span>
                    ) : (
                      <span className="inline-block whitespace-nowrap rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        to&apos;siq emas
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-[12.5px] text-muted-foreground">
            {ok
              ? "Bekor qilinsa, qism faol bo'lmay qoladi (state = 0) va barcha hisobotlardan chiqadi. Amal auditga yoziladi."
              : item.active
                ? "Pul allaqachon topshiriqnomaga kiritilgan — avval o'sha topshiriqnoma hal qilinishi kerak."
                : "Bu qism allaqachon faol emas."}
          </p>
          <form action={cancelAttachmentAction}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              disabled={!ok || !yozuvBor}
              title={!yozuvBor ? "Yozuv ulanishi sozlanmagan" : !ok ? "Shartlar bajarilmagan" : "Birikishni bekor qilish"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm transition",
                ok && yozuvBor ? "bg-red-700 hover:opacity-90" : "cursor-not-allowed bg-slate-300",
              )}
            >
              <Link2Off className="h-4 w-4" />
              Birikishni bekor qilish
            </button>
          </form>
        </div>
      </Card>
    </>
  );
}

function Field({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-700">{value ?? "—"}</dd>
    </div>
  );
}
