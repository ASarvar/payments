import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Banknote, FileDown, Landmark, Scale, Search, Split } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { CHANNELS } from "@/lib/channels";
import { href, one, type SP } from "@/lib/filters";
import { withBase } from "@/lib/basePath";
import { TONE_CLS, sendState, shareState } from "@/lib/uzasbo";
import { findPayIdByItem, getDistribution, type ChannelDist, type Distribution } from "@/server/services/taqsimot";
import { dmy, money, nf, pct1, sum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/KpiCard";
import { inputCls, labelCls } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";
import { TaqsimotNav } from "./parts";

const ID_RE = /^\d{1,18}$/;

export default async function TaqsimotPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Hozircha FAQAT adminlar (foydalanuvchi qarori, 2026-09-15) — moderator ro'yxatga yuboriladi.
  await requireUserOrRedirect();
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="Taqsimot" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  const raw = one(sp.id)?.trim() ?? "";
  const id = ID_RE.test(raw) ? raw : undefined;
  const qismRaw = one(sp.qism);
  const qism = qismRaw && ID_RE.test(qismRaw) ? qismRaw : undefined;

  let dist: Distribution | null = null;
  let error: string | null = null;
  let missing = false;
  let goTo: string | null = null;
  if (id) {
    try {
      dist = await getDistribution(id);
      if (!dist) {
        // Biriktirish (qism) ID si kiritilgan bo'lishi mumkin — o'z hujjatiga o'tamiz.
        const payId = await findPayIdByItem(id);
        if (payId && payId !== id) goTo = href("/dashboard/taqsimot", { id: payId, qism: id });
        else missing = true;
      }
    } catch (e) {
      console.error("[taqsimot]", e);
      error = projectErrorMessage(e);
    }
  }
  // ⚠️ try TASHQARISIDA — redirect() xato tashlab ishlaydi, catch uni yutib yuborardi.
  if (goTo) redirect(goTo);

  return (
    <div>
      <PageHeader
        title="Taqsimot"
        subtitle="To'lov hujjati pulining yo'li: qismlar (shartnomalar) → 12 kanal ulushi → g'aznachilikka topshiriqnomalar"
      />
      <TaqsimotNav active="hujjat" />

      <form className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className={labelCls}>To&apos;lov hujjati ID</span>
          {/* `key` — boshqa hujjatga havola orqali o'tilganda maydon yangi qiymat bilan qayta chiziladi. */}
          <input
            key={raw}
            type="text"
            name="id"
            inputMode="numeric"
            defaultValue={raw}
            placeholder="Masalan: 699015030 (biriktirish ID si ham bo'ladi)"
            className={inputCls}
          />
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

      {raw && !id ? <ErrorBox message="ID faqat raqamlardan iborat bo'lishi kerak." /> : null}
      {error ? <ErrorBox message={error} /> : null}
      {missing ? <ErrorBox message={`#${id} topilmadi — na to'lov hujjatlari, na biriktirishlar orasida yo'q.`} /> : null}
      {!raw ? <Intro /> : null}
      {dist ? <DistributionView d={dist} qism={qism} /> : null}
    </div>
  );
}

function Intro() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-[13px] leading-relaxed text-slate-600 shadow-sm">
      <p>
        To&apos;lov hujjati ID sini kiriting (<code>paydocs.id</code> — bankdan kelgan to&apos;lov). Sahifa hujjat qaysi
        shartnomalarga biriktirilgani, har bir qism 12 kanalga qanday bo&apos;lingani va har bir ulush g&apos;aznachilikka
        topshiriqnoma bilan yuborilib, to&apos;langan-to&apos;lanmaganini ko&apos;rsatadi.
      </p>
      <p className="mt-2">
        ID ni &quot;To&apos;lovlar ro&apos;yxati&quot;dan olish mumkin — qatordagi <strong>to&apos;lov #…</strong> havolasi
        shu sahifani ochadi. Biriktirish ID si kiritilsa, uning hujjatiga o&apos;tiladi.
      </p>
    </div>
  );
}

function Field({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-700">{value ?? "—"}</dd>
    </div>
  );
}

function Chip({ tone, children, title }: { tone: keyof typeof TONE_CLS; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium", TONE_CLS[tone])}>
      {children}
    </span>
  );
}

const ZERO: Omit<ChannelDist, "key" | "label" | "lastPaid"> = { share: 0, accepted: 0, included: 0, paid: 0, noSend: 0, extraPaid: 0 };

function DistributionView({ d, qism }: { d: Distribution; qism?: string }) {
  const { doc } = d;
  const remainder = doc.asum - d.attached.s;
  const balanced = Math.abs(remainder) < 0.005;
  const spread = d.attached.s - d.channelsSum;
  const channels = d.channels.filter((c) => c.share > 0 || c.included > 0 || c.paid > 0);
  const tot = channels.reduce(
    (a, c) => ({
      share: a.share + c.share,
      accepted: a.accepted + c.accepted,
      included: a.included + c.included,
      paid: a.paid + c.paid,
      noSend: a.noSend + c.noSend,
      extraPaid: a.extraPaid + c.extraPaid,
    }),
    ZERO,
  );
  // Takroriy ro'yxatdagilar (to'plangan ro'yxat) yashiriladi — summaga kirmaydi, soni pastda aytiladi.
  const shownSends = d.sends.filter((s) => s.role !== "takror");
  const repeatSends = d.sends.length - shownSends.length;

  return (
    <>
      <Card
        title={`Hujjat #${doc.id}`}
        subtitle={
          <>
            {doc.type ?? "—"} · № {doc.docNum ?? "—"} · {dmy(doc.docDate)}
            {!doc.active ? (
              <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                faol emas (state ≠ 1) — hisobotlarga kirmaydi
              </span>
            ) : null}
          </>
        }
        right={
          <a
            href={withBase(href("/api/taqsimot", { id: doc.id }))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-slate-600 transition hover:bg-muted"
          >
            <FileDown className="h-4 w-4" />
            Excel
          </a>
        }
      >
        <dl className="grid gap-x-8 gap-y-3 px-4 py-3 text-[13px] md:grid-cols-2">
          <Field label="To'lovchi" value={doc.payer} />
          <Field label="Qabul qiluvchi" value={doc.receiver} />
          <Field label="To'lov maqsadi" value={doc.note} wide />
          <Field label="Hudud" value={[doc.region, doc.district].filter(Boolean).join(" · ") || null} />
          <Field label="Bazaga kiritilgan" value={dmy(doc.createdAt, true)} />
        </dl>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Hujjat summasi" {...money(doc.asum)} footer={`to'lov sanasi ${dmy(doc.docDate)}`} accent="#1a3a7c" icon={Banknote} />
        <KpiCard
          label="Qismlarga biriktirilgan"
          {...money(d.attached.s)}
          footer={`${nf(d.attached.n)} ta faol qism (shartnoma)`}
          accent="#2563eb"
          icon={Split}
        />
        <KpiCard
          label={remainder < 0 ? "Ortiqcha taqsimlangan" : "Taqsimlanmagan qoldiq"}
          {...money(Math.abs(remainder))}
          footer={balanced ? "hujjat to'liq taqsimlangan" : "hujjat summasi bilan qismlar yig'indisi farqi — tekshirish kerak"}
          accent={balanced ? "#15803d" : "#b91c1c"}
          icon={Scale}
        />
        <KpiCard
          label="G'aznachilikda to'langan"
          {...money(d.paidSum)}
          footer={`kanal ulushlarining ${pct1(d.paidSum, d.channelsSum)}`}
          accent="#15803d"
          icon={Landmark}
        />
      </div>

      <Card
        title="Kanallar bo'yicha"
        subtitle={
          <>
            Kanallarga taqsimlangan jami: <strong>{sum(d.channelsSum)}</strong> so&apos;m
            {Math.abs(spread) >= 1 ? (
              <span className="text-amber-800"> · qismlar summasidan farqi {sum(spread)} so&apos;m</span>
            ) : null}
            {channels.length < CHANNELS.length ? <> · qolgan kanallarga ulush yo&apos;q</> : null}
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={th}>Kanal</th>
                <th className={thR}>Ulush</th>
                <th className={thR}>Tasdiqlangan</th>
                <th className={thR}>Topshiriqnomaga kiritilgan</th>
                <th className={thR}>G&apos;aznachilikda to&apos;langan</th>
                <th className={thR}>To&apos;lanmagan</th>
                <th className={th}>Oxirgi to&apos;lov</th>
                <th className={th}>Izoh</th>
              </tr>
            </thead>
            <tbody>
              <tr className={totalRow} style={totalStyle}>
                <td className={td}>J A M I</td>
                <td className={tdR}>{sum(tot.share)}</td>
                <td className={tdR}>{sum(tot.accepted)}</td>
                <td className={tdR}>{sum(tot.included)}</td>
                <td className={tdR}>{sum(tot.paid)}</td>
                <td className={tdR}>{sum(Math.max(0, tot.share - tot.paid))}</td>
                <td className={td} />
                <td className={td} />
              </tr>
              {channels.map((c) => (
                <tr key={c.key} className="border-b border-border last:border-0">
                  <td className={`${td} font-medium`}>{c.label}</td>
                  <td className={tdR}>{sum(c.share)}</td>
                  <td className={tdR}>{sum(c.accepted)}</td>
                  <td className={tdR}>{sum(c.included)}</td>
                  <td className={cn(tdR, c.paid > 0 && "text-emerald-700")}>{sum(c.paid)}</td>
                  <td className={cn(tdR, c.share - c.paid >= 1 && "font-semibold text-amber-800")}>{sum(Math.max(0, c.share - c.paid))}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{dmy(c.lastPaid)}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {c.extraPaid > 0 ? <Chip tone="bad">ikki marta to&apos;langan: {sum(c.extraPaid)}</Chip> : null}
                      {c.noSend > 0 ? (
                        <Chip tone="bad" title="sent_* belgisi qo'yilgan, lekin bu ulush hech bir topshiriqnomada yo'q">
                          belgi bor, topshiriqnoma yo&apos;q: {sum(c.noSend)}
                        </Chip>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Qismlar — ${nf(d.items.length)} ta`} subtitle="Hujjat qaysi shartnomalarga biriktirilgan va har bir ulush qaysi bosqichda.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={th}>Biriktirish ID</th>
                <th className={th}>Biriktirilgan</th>
                <th className={th}>Shartnoma</th>
                <th className={th}>Balansda saqlovchi</th>
                <th className={thR}>Summa</th>
                <th className={th}>Kanallar</th>
              </tr>
            </thead>
            <tbody>
              {d.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Hujjat birorta shartnomaga biriktirilmagan — pul taqsimlanmagan.
                  </td>
                </tr>
              ) : (
                d.items.map((it) => (
                  <tr
                    key={it.id}
                    className={cn("border-b border-border last:border-0", !it.active && "opacity-60", it.id === qism && "bg-amber-50/70")}
                  >
                    <td className={`${td} tabular-nums`}>
                      <div className="font-medium text-slate-800">{it.id}</div>
                      {!it.active ? <div className="text-[11px] text-red-700">bekor (state ≠ 1) — sanalmaydi</div> : null}
                      {it.id === qism ? <div className="text-[11px] text-amber-800">siz qidirgan biriktirish</div> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{dmy(it.createdAt, true)}</td>
                    <td className={td}>
                      {it.contractNumber ?? "—"}
                      {it.contractNumber && !it.contractActive ? (
                        <div className="text-[11px] text-red-700">faol emas</div>
                      ) : null}
                    </td>
                    <td className={`${td} max-w-[260px]`}>
                      {it.ownerName ? <div className="line-clamp-2">{it.ownerName}</div> : "—"}
                      {it.ownerTin ? <div className="text-[11px] text-muted-foreground">STIR {it.ownerTin}</div> : null}
                    </td>
                    <td className={`${tdR} font-semibold`}>{sum(it.asum)}</td>
                    <td className={td}>
                      <div className="flex max-w-[520px] flex-wrap gap-1">
                        {CHANNELS.map((c) => {
                          const sh = it.shares[c.key];
                          if (!sh) return null;
                          const st = shareState(sh.accepted, sh.sent, it.paidTimes[c.key] ?? 0);
                          return (
                            <Chip key={c.key} tone={st.tone} title={`${c.label}: ${st.label}`}>
                              {c.label} <span className="tabular-nums">{sum(sh.sum)}</span>
                            </Chip>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          Ranglar:
          <Chip tone="off">tasdiqlanmagan</Chip>
          <Chip tone="info">tasdiqlangan, kiritilmagan</Chip>
          <Chip tone="wait">topshiriqnomaga kiritilgan, to&apos;lanmagan</Chip>
          <Chip tone="ok">g&apos;aznachilikda to&apos;langan</Chip>
          <Chip tone="bad">ikki marta to&apos;langan / tasdiqlanmasdan kiritilgan</Chip>
          <span>— sichqonchani ustiga olib boring.</span>
        </div>
      </Card>

      <Card
        title={`G'aznachilikka topshiriqnomalar — ${nf(shownSends.length)} ta`}
        subtitle="Bitta topshiriqnoma bir oluvchiga bir davr uchun ko'p qismni birlashtiradi. «Hujjat ulushi» — shu hujjat ulushlaridan aynan shu topshiriqnoma to'lagani."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={th}>ID</th>
                <th className={th}>Kanal · oluvchi</th>
                <th className={th}>Davr</th>
                <th className={th}>Holat</th>
                <th className={th}>G&apos;aznachilik sanasi</th>
                <th className={thR}>Topshiriqnoma summasi</th>
                <th className={thR}>Hujjat ulushi</th>
                <th className={thR}>Qismlar</th>
              </tr>
            </thead>
            <tbody>
              {shownSends.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Bu hujjat qismlari hali birorta topshiriqnomaga kiritilmagan.
                  </td>
                </tr>
              ) : (
                shownSends.map((s) => {
                  const st = sendState(s.status, s.uzasboStatus);
                  return (
                    <tr key={s.id} className={cn("border-b border-border last:border-0", s.role === "tarix" && "opacity-60")}>
                      <td className={`${td} tabular-nums`}>
                        <div className="font-medium text-slate-800">{s.id}</div>
                        {s.recreated ? (
                          <div className="text-[11px] text-muted-foreground">rad etilgan #{s.recreated} o&apos;rniga</div>
                        ) : null}
                      </td>
                      <td className={`${td} max-w-[280px]`}>
                        <div className="font-medium">{s.channelLabel}</div>
                        <div className="line-clamp-2 text-[12px] text-muted-foreground">{s.receiverName ?? "—"}</div>
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>
                        {dmy(s.dateFrom)} — {dmy(s.dateTo)}
                      </td>
                      <td className={`${td} max-w-[260px]`}>
                        <Chip tone={st.tone}>{st.label}</Chip>
                        {!s.paid && s.reason ? <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{s.reason}</div> : null}
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{dmy(s.treasDate)}</td>
                      <td className={tdR}>{sum(s.receiverSum)}</td>
                      <td className={`${tdR} font-semibold`}>{sum(s.docShare)}</td>
                      <td className={tdR}>
                        {nf(s.ourIds.length)} / {nf(s.itemCount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {repeatSends > 0 ? (
          <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">
            Yana {nf(repeatSends)} ta topshiriqnoma bu qismlarni ro&apos;yxatida qayta keltirgan: ularning ro&apos;yxati davr
            boshidan to&apos;planadi, summasi esa faqat yangi qismlar uchun — shu hujjat summasiga kirmaydi (Excel&apos;da bor).
          </p>
        ) : null}
      </Card>

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <strong>Topshiriqnomaga kiritilgan</strong> — qismdagi <code>sent_*</code> belgisi (ilovaning boshqa bo&apos;limlaridagi
        «O&apos;tkazilgan» shu belgi). U topshiriqnoma YARATILGANDA qo&apos;yiladi — pul hali to&apos;lanmagan bo&apos;lishi mumkin.{" "}
        <strong>G&apos;aznachilikda to&apos;langan</strong> — topshiriqnoma yuborilgan va g&apos;aznachilik ijro etgan (SENT, kod 4).
        Faqat faol qismlar (<code>state = 1</code>) sanaladi. Ma&apos;lumot keshlanadi — «Yangilash» tugmasi uni yangilaydi.
      </p>
    </>
  );
}
