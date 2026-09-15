import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, filterParams, href, type SP } from "@/lib/filters";
import { PAID_CACHE_SECONDS } from "@/server/services/uzasboSql";
import {
  LATE_DAYS,
  addMetrics,
  emptyMetrics,
  getChannelMatrix,
  getDistricts,
  getRegionMatrix,
  getRegions,
  matrixOf,
  type ChannelMatrix,
  type Metrics,
  type RegionMatrix,
  type RegionMatrixRow,
} from "@/server/services/payments";
import { getBiriktirish, getDoublePaid, getProblemSummary, totalBir, type BirAmounts, type BirRow } from "@/server/services/taqsimot";
import { DYNAMICS_DAYS, getDynamics, type DayPoint } from "@/server/services/nazorat";
import { dmy, mln, money, nf, pct1, sum, todayTashkent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/FilterBar";
import { IssueTile } from "@/components/IssueTile";
import { DayChart, SERIES } from "@/components/DayChart";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";

/**
 * NAZORAT PANELI (2026-09-15, foydalanuvchi tanlovi): pul yo'li zanjiri, hududlar svetofori, kunlik
 * dinamika va 12 kanal matritsasi — bitta sahifada. Og'ir hisob `getRegionMatrix` da (hudud × kanal,
 * bitta skan): svetofor ham, matritsa ham shundan — hudud tanlanganda qayta hisoblanmaydi.
 */

/** Svetofor chegaralari, % — faqat shu yerda. */
const LIGHT = { good: 95, warn: 85 } as const; // biriktirilgan / to'langan ulushi: ≥ good yashil, ≥ warn sariq, qolgani qizil
const LATE_LIGHT = { good: 5, warn: 15 } as const; // kechikkan / taqsimlangan: ≤ good yashil, ≤ warn sariq, qolgani qizil

type Tone = "good" | "warn" | "bad" | "none";
const TONE_COLOR: Record<Tone, string> = { good: "#16a34a", warn: "#f59e0b", bad: "#dc2626", none: "#cbd5e1" };
const TONE_RANK: Record<Tone, number> = { none: 0, good: 1, warn: 2, bad: 3 };
const ratio = (a: number, b: number): number | null => (b > 0 ? (a / b) * 100 : null);
const toneHigh = (p: number | null): Tone => (p === null ? "none" : p >= LIGHT.good ? "good" : p >= LIGHT.warn ? "warn" : "bad");
const toneLow = (p: number | null): Tone => (p === null ? "none" : p <= LATE_LIGHT.good ? "good" : p <= LATE_LIGHT.warn ? "warn" : "bad");
const sumChannels = (r: RegionMatrixRow): Metrics =>
  Object.values(r.channels).reduce((a, m) => addMetrics(a, m), emptyMetrics());

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUserOrRedirect();
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title="Nazorat paneli" />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  // Standart sana (`DEFAULT_FROM`) hamma sahifada bir xil — jadvaldagi son = ro'yxatdagi son.
  const { f, danExplicit } = parseFilters(sp);
  const today = todayTashkent();
  // Kirim (biriktirish) va dinamika aniq oxirgi kunni talab qiladi; qismlar — `f.to` (ro'yxat bilan bir xil).
  const to = f.to ?? today;

  const [regionsR, districtsR] = await Promise.allSettled([
    getRegions(),
    f.obl !== undefined ? getDistricts(f.obl) : Promise.resolve([]),
  ]);
  const regions = regionsR.status === "fulfilled" ? regionsR.value : [];
  const districts = districtsR.status === "fulfilled" ? districtsR.value : [];
  // Hudud almashganda eski tuman qolib ketgan bo'lsa — tashlanadi (natija jimgina bo'sh chiqmasin).
  if (f.area !== undefined && !districts.some((d) => d.id === f.area)) f.area = undefined;
  const regionName = (id: number) => regions.find((r) => r.id === id)?.name ?? `#${id}`;

  const badDates = Boolean(f.from && f.from > to);
  const skip = <T,>() => Promise.resolve(null as T | null);
  const [rmR, tmR, birR, dynR, probR, dblR] = await Promise.allSettled([
    badDates ? skip<RegionMatrix>() : getRegionMatrix(f.from, f.to),
    !badDates && f.area !== undefined ? getChannelMatrix(f) : skip<ChannelMatrix>(),
    badDates ? skip<BirRow[]>() : getBiriktirish(f.from, to),
    badDates ? skip<DayPoint[]>() : getDynamics(to, f.obl),
    badDates ? skip<Awaited<ReturnType<typeof getProblemSummary>>>() : getProblemSummary(f),
    getDoublePaid(),
  ]);
  for (const [name, r] of [["matrix", rmR], ["tuman", tmR], ["bir", birR], ["dyn", dynR], ["prob", probR], ["double", dblR]] as const) {
    if (r.status === "rejected") console.error(`[nazorat:${name}]`, r.reason);
  }
  const val = <T,>(r: PromiseSettledResult<T | null>): T | null => (r.status === "fulfilled" ? r.value : null);
  const rm = val(rmR);
  const regionRows = rm?.rows ?? null;
  const birRows = val(birR);
  const dyn = val(dynR);

  // Kanallar matritsasi: tuman → alohida so'rov; hudud → o'sha qator; aks holda — hammasi.
  const matrix: ChannelMatrix | null =
    f.area !== undefined
      ? val(tmR)
      : rm
        ? matrixOf(f.obl !== undefined ? rm.rows.filter((r) => r.id === f.obl) : rm.rows, rm.computedAt)
        : null;
  const matrixError = f.area !== undefined ? tmR : rmR;
  const totals = matrix ? matrix.channels.reduce((acc, c) => addMetrics(acc, c.m), emptyMetrics()) : null;

  // Kirim (tushum → biriktirildi): `payments` da tuman yo'q — tuman tanlansa ko'rsatilmaydi.
  const kirim: (BirAmounts & { day: BirAmounts }) | null =
    f.area !== undefined || !birRows
      ? null
      : f.obl !== undefined
        ? (birRows.find((r) => r.id === f.obl) ?? null)
        : totalBir(birRows);

  const fp = filterParams(f);
  const listHref = (kanal: string, holat: string) => href("/dashboard/royxat", { kanal, holat, ...fp });
  const dayLabel = to === today ? "bugun" : dmy(to);
  const birQ = { dan: f.from ?? "", gacha: to };
  const birGapHref =
    f.obl !== undefined
      ? href("/dashboard/taqsimot/biriktirish/hujjatlar", { hudud: f.obl, holat: "biriktirilmagan", ...birQ })
      : href("/dashboard/taqsimot/biriktirish", birQ);
  const paidToday = f.area === undefined ? dyn?.find((p) => p.d === to)?.tolangan : undefined;

  const stages: Stage[] = [];
  if (kirim) {
    stages.push({ label: "Tushum", hint: "bank to'lov hujjatlari", value: kirim.tushum, base: kirim.tushum, day: `${dayLabel}: +${mln(kirim.day.tushum)} mln` });
    stages.push({
      label: "Biriktirildi",
      hint: "tushumdan",
      value: kirim.biriktirilgan,
      base: kirim.tushum,
      day: `${dayLabel}: +${mln(kirim.day.biriktirilgan)} mln`,
      gap:
        kirim.farq >= 0
          ? { label: "biriktirilmagan", value: kirim.farq, href: birGapHref, tone: "bad" }
          : { label: "ortiqcha biriktirilgan", value: -kirim.farq, href: birGapHref, tone: "warn" },
    });
  }
  if (totals) {
    const taq = totals.jami.s;
    stages.push({
      label: "12 kanalga taqsimlandi",
      hint: kirim ? "tushumdan · oluvchilar ulushi" : "oluvchilar ulushi",
      value: taq,
      base: kirim ? kirim.tushum : taq,
    });
    stages.push({
      label: "Tasdiqlandi",
      hint: "taqsimlangandan",
      value: taq - totals.tasdiqlanmagan.s,
      base: taq,
      gap: { label: "tasdiqlanmagan", value: totals.tasdiqlanmagan.s, href: "#kanallar", tone: "bad" },
    });
    stages.push({
      label: "Topshiriqnomaga kiritildi",
      hint: "taqsimlangandan",
      value: totals.otkazilgan.s,
      base: taq,
      gap: { label: "tasdiqlangan, kiritilmagan", value: totals.otkazilmagan.s, href: "#kanallar", tone: "bad" },
    });
    stages.push({
      label: "G'aznachilik to'ladi",
      hint: "taqsimlangandan",
      value: totals.tolangan.s,
      base: taq,
      day: paidToday !== undefined ? `g'aznachilik ${dayLabel}: ${mln(paidToday)} mln` : undefined,
      gap: { label: "topshiriqnomada, to'lanmagan", value: totals.topshiriqnomada.s, href: "#kanallar", tone: "bad" },
    });
  }

  const lights = lightRows(regionRows, birRows, regionName);
  const prob = val(probR);
  const dbl = val(dblR);
  const scope =
    f.area !== undefined
      ? `${regionName(f.obl ?? -1)} · ${districts.find((d) => d.id === f.area)?.name ?? `#${f.area}`}`
      : f.obl !== undefined
        ? regionName(f.obl)
        : "Respublika";
  const period = `${f.from ? dmy(f.from) : "boshidan"} — ${f.to ? dmy(f.to) : dmy(today)}`;

  return (
    <div>
      <PageHeader
        title="Nazorat paneli"
        subtitle={
          <>
            {scope} · to&apos;lov sanasi {period}
            {!danExplicit ? <> (standart boshlanish sanasi)</> : null}
            {matrix?.lastCreated ? <> · oxirgi biriktirish: {dmy(matrix.lastCreated, true)}</> : null}
            {matrix ? (
              <>
                {" · "}hisoblangan: {dmy(matrix.computedAt, true)} ({Math.round(PAID_CACHE_SECONDS / 60)} daqiqada yangilanadi,
                «Yangilash» — darhol)
              </>
            ) : null}
          </>
        }
      />

      <FilterBar
        values={{ dan: f.from, gacha: f.to, hudud: f.obl?.toString(), tuman: f.area?.toString() }}
        resetHref="/dashboard"
        regions={regions.map((r) => ({ value: String(r.id), label: r.name }))}
        districts={districts.map((d) => ({ value: String(d.id), label: d.name }))}
      />

      {badDates ? <ErrorBox message="Boshlanish sanasi oxirgi sanadan keyin — sanalarni tekshiring." /> : null}
      {matrixError.status === "rejected" ? <ErrorBox message={projectErrorMessage(matrixError.reason)} /> : null}

      {stages.length > 0 ? (
        <Card
          title="Pul yo'li"
          subtitle={
            <>
              Tushgan puldan g&apos;aznachilik to&apos;laguncha — har bosqichda qancha turib qolgani.{" "}
              {f.area !== undefined
                ? "Tuman tanlangan: kirim (tushum, biriktirish) faqat hudud kesimida bor — ko'rsatilmadi."
                : !kirim
                  ? "Kirim ma'lumoti olinmadi."
                  : null}
            </>
          }
        >
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {stages.map((s, i) => (
              <StageCard key={s.label} n={i + 1} s={s} />
            ))}
          </div>
        </Card>
      ) : null}

      {totals ? (
        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <IssueTile title="Tasdiqlanmasdan o'tkazilgan ulushlar" n={totals.anomaliya.n} s={totals.anomaliya.s} href="#kanallar" />
          <IssueTile
            title="Muammoli to'lov hujjatlari"
            note="taqsimlanmagan, qisman, ortiqcha"
            n={prob ? prob.kinds.taqsimlanmagan.n + prob.kinds.qisman.n + prob.kinds.ortiqcha.n : undefined}
            s={prob ? prob.kinds.taqsimlanmagan.s + prob.kinds.qisman.s + prob.kinds.ortiqcha.s : undefined}
            href={href("/dashboard/taqsimot/muammoli", fp)}
            failed={probR.status === "rejected" ? projectErrorMessage(probR.reason) : undefined}
          />
          <IssueTile
            title="Ikki marta to'langan (bal. saqlovchi)"
            note="barcha davr, ortiqcha summa"
            n={dbl?.rows.length}
            s={dbl ? dbl.rows.reduce((a, r) => a + Math.max(0, r.extra), 0) : undefined}
            href="/dashboard/taqsimot/takroriy"
            failed={dblR.status === "rejected" ? projectErrorMessage(dblR.reason) : undefined}
          />
        </div>
      ) : null}

      {lights.length > 0 ? (
        <Card
          title="Hududlar svetofori"
          subtitle={
            <>
              Eng orqada qolgan hudud tepada · summalar mln so&apos;m · hudud tanlovidan qat&apos;i nazar barcha hududlar ·
              nomini bosing — panel shu hududga o&apos;tadi
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className={th}>Hudud</th>
                  <th className={thR}>Tushum</th>
                  <th className={thR}>Biriktirilgan</th>
                  <th className={thR}>Taqsimlangan</th>
                  <th className={thR}>To&apos;langan</th>
                  <th className={thR}>To&apos;lanmagan</th>
                  <th className={thR} title={`To'lov sanasidan ${LATE_DAYS} kundan ko'p o'tgan, hali to'lanmagan ulushlar`}>
                    shundan {LATE_DAYS}+ kun
                  </th>
                </tr>
              </thead>
              <tbody>
                {lights.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0"
                    style={r.id === f.obl ? { background: "var(--gold-lighter)" } : undefined}
                  >
                    <td className={`${td} whitespace-nowrap`}>
                      <Dot tone={r.worst} />
                      <Link
                        href={href("/dashboard", filterParams({ from: f.from, to: f.to, obl: r.id }))}
                        className="ml-2 font-medium hover:underline"
                        style={{ color: "var(--cobalt)" }}
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className={tdR}>{r.tushum === null ? "—" : mln(r.tushum)}</td>
                    <td className={tdR}>
                      <Pct tone={r.tones.bir} text={r.tushum === null || r.bir === null ? "—" : pct1(r.bir, r.tushum)} />
                    </td>
                    <td className={tdR}>{mln(r.taq)}</td>
                    <td className={tdR}>
                      <Pct tone={r.tones.paid} text={pct1(r.paid, r.taq)} />
                    </td>
                    <td className={tdR}>{mln(r.taq - r.paid)}</td>
                    <td className={cn(tdR, r.tones.late === "bad" && "font-semibold text-red-700")}>
                      <Pct tone={r.tones.late} text={mln(r.late)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
            <Dot tone="good" /> {LIGHT.good}% va ko&apos;p · <Dot tone="warn" /> {LIGHT.warn}–{LIGHT.good}% ·{" "}
            <Dot tone="bad" /> {LIGHT.warn}% dan kam. «{LATE_DAYS}+ kun» — taqsimlanganning {LATE_LIGHT.good}% gacha yashil,{" "}
            {LATE_LIGHT.warn}% gacha sariq. Hudud yonidagi belgi — uchalasining eng yomoni.
          </p>
        </Card>
      ) : null}

      {dyn ? <Dynamics points={dyn} scope={f.obl !== undefined ? regionName(f.obl) : "Respublika"} area={f.area !== undefined} /> : null}
      {dynR.status === "rejected" ? <ErrorBox message={`Dinamika: ${projectErrorMessage(dynR.reason)}`} /> : null}

      {matrix && totals ? (
        <div id="kanallar" className="scroll-mt-4">
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
                    <th className={thR}>To&apos;langan</th>
                    <th className={thR}>Ulushi</th>
                    <th className={thR}>Topshiriqnomada</th>
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
                    <td className={tdR}>{sum(totals.tolangan.s)}</td>
                    <td className={tdR}>{pct1(totals.tolangan.s, totals.jami.s)}</td>
                    <td className={tdR}>{sum(totals.topshiriqnomada.s)}</td>
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
                        <td className={tdR}>
                          <Link href={listHref(c.key, "tolangan")} className="hover:underline">
                            {sum(c.m.tolangan.s)}
                          </Link>
                        </td>
                        <td className={tdR}>{pct1(c.m.tolangan.s, c.m.jami.s)}</td>
                        <td className={tdR}>
                          <Link href={listHref(c.key, "topshiriqnomada")} className="hover:underline">
                            {sum(c.m.topshiriqnomada.s)}
                          </Link>
                        </td>
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
        </div>
      ) : null}

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <strong>Tushum</strong> va <strong>biriktirildi</strong> — «Biriktirish borishi» hisoboti bilan bir xil (hujjat
        sanasi va hududi). <strong>Taqsimlandi</strong> — shartnomalarga biriktirilgan qismlarning 12 oluvchiga ulushi (to&apos;lov
        sanasi bo&apos;yicha); keyingi bosqichlar shu ulushlardan: <strong>tasdiqlanmagan</strong> + <strong>o&apos;tkazilmagan</strong>{" "}
        (tasdiqlangan, topshiriqnomaga kiritilmagan) + <strong>topshiriqnomada</strong> (kiritilgan, g&apos;aznachilik hali
        to&apos;lamagan) + <strong>to&apos;langan</strong> = taqsimlangan. <strong>To&apos;langan</strong> — ulush g&apos;aznachilik
        ijro etgan topshiriqnomada bor (<code>SENT</code>, javob 4). Ma&apos;lumot <code>project</code> bazasidan faqat
        o&apos;qiladi.
      </p>
    </div>
  );
}

// ── Pul yo'li ────────────────────────────────────────────────────────────────

interface Stage {
  label: string;
  hint: string;
  value: number;
  /** Foiz shu summaga nisbatan (birinchi bosqichda — o'zi). */
  base: number;
  day?: string;
  gap?: { label: string; value: number; href: string; tone: "bad" | "warn" };
}

function StageCard({ n, s }: { n: number; s: Stage }) {
  const v = money(s.value);
  const pct = s.base > 0 ? Math.max(0, Math.min(100, (s.value / s.base) * 100)) : 0;
  const first = s.value === s.base && n === 1;
  const g = s.gap && s.gap.value >= 0.5 ? s.gap : null;
  const gm = g ? money(g.value) : null;
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: "var(--navy)" }}
        >
          {n}
        </span>
        <p className="text-[13px] font-semibold" style={{ color: "var(--navy)" }}>
          {s.label}
        </p>
      </div>
      <p className="mt-2.5 text-2xl font-bold leading-none tracking-tight" style={{ color: "var(--navy)" }}>
        {v.value}
        <span className="ml-1 text-[13px] font-semibold text-muted-foreground">{v.unit}</span>
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: first ? "var(--cobalt)" : "var(--gold)" }} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        {first ? s.hint : `${pct1(s.value, s.base)} ${s.hint}`}
      </p>
      {s.day ? <p className="mt-0.5 text-[11.5px] text-slate-600">{s.day}</p> : null}
      {g && gm ? (
        // Sahifa ichidagi (#kanallar) havola — oddiy <a>; boshqa sahifaga — Link.
        g.href.startsWith("#") ? (
          <a href={g.href} className="mt-auto pt-2.5">
            <GapChip g={g} gm={gm} />
          </a>
        ) : (
          <Link href={g.href} className="mt-auto pt-2.5">
            <GapChip g={g} gm={gm} />
          </Link>
        )
      ) : null}
    </div>
  );
}

function GapChip({ g, gm }: { g: NonNullable<Stage["gap"]>; gm: { value: string; unit: string } }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium hover:underline",
        g.tone === "bad" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
      )}
    >
      ▼ {g.label}: {gm.value} {gm.unit}
    </span>
  );
}

// ── Svetofor ────────────────────────────────────────────────────────────────

interface LightRow {
  id: number;
  name: string;
  tushum: number | null;
  bir: number | null;
  taq: number;
  paid: number;
  late: number;
  tones: { bir: Tone; paid: Tone; late: Tone };
  worst: Tone;
  paidPct: number | null;
}

/** Hududlar (id > 0) — qismlar va kirim birlashtirilib; eng yomoni tepada, keyin to'langan ulushi o'sib. */
function lightRows(regionRows: RegionMatrixRow[] | null, bir: BirRow[] | null, name: (id: number) => string): LightRow[] {
  const ids = new Set<number>();
  for (const r of regionRows ?? []) if (r.id !== null && r.id > 0) ids.add(r.id);
  for (const b of bir ?? []) if (b.id !== null && b.id > 0) ids.add(b.id);
  const out: LightRow[] = [];
  for (const id of ids) {
    const rr = regionRows?.find((r) => r.id === id);
    const b = bir?.find((x) => x.id === id);
    const m = rr ? sumChannels(rr) : emptyMetrics();
    const taq = m.jami.s;
    if (taq === 0 && (b?.tushum ?? 0) === 0) continue;
    const paidPct = ratio(m.tolangan.s, taq);
    const tones = {
      bir: b ? toneHigh(ratio(b.biriktirilgan, b.tushum)) : ("none" as Tone),
      paid: toneHigh(paidPct),
      late: toneLow(ratio(rr?.late ?? 0, taq)),
    };
    const worst = [tones.bir, tones.paid, tones.late].reduce<Tone>((a, t) => (TONE_RANK[t] > TONE_RANK[a] ? t : a), "none");
    out.push({
      id,
      name: name(id),
      tushum: b ? b.tushum : null,
      bir: b ? b.biriktirilgan : null,
      taq,
      paid: m.tolangan.s,
      late: rr?.late ?? 0,
      tones,
      worst,
      paidPct,
    });
  }
  return out.sort((a, b) => TONE_RANK[b.worst] - TONE_RANK[a.worst] || (a.paidPct ?? 101) - (b.paidPct ?? 101));
}

function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className="inline-block size-2.5 rounded-full align-middle" style={{ background: TONE_COLOR[tone] }} />;
}

function Pct({ tone, text }: { tone: Tone; text: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {text}
      <Dot tone={tone} />
    </span>
  );
}

// ── Dinamika ────────────────────────────────────────────────────────────────

function Dynamics({ points, scope, area }: { points: DayPoint[]; scope: string; area: boolean }) {
  const t = points.reduce((a, p) => a + p.tushum, 0);
  const b = points.reduce((a, p) => a + p.biriktirilgan, 0);
  const u = points.reduce((a, p) => a + p.tolangan, 0);
  const first = points[0]?.d ?? "";
  const last = points[points.length - 1]?.d ?? "";
  return (
    <Card
      title={`Kunlik dinamika — oxirgi ${DYNAMICS_DAYS} kun`}
      subtitle={
        <>
          {scope} · {dmy(first)} — {dmy(last)}
          {area ? " · tuman tanlangan, dinamika hudud bo'yicha" : null} · ustun ustiga keling — o&apos;sha kun raqamlari
        </>
      }
    >
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pt-3 text-[12.5px]">
        <Legend color={SERIES.tushum.color} label={`${SERIES.tushum.label}: ${mln(t)} mln`} />
        <Legend color={SERIES.biriktirilgan.color} label={`${SERIES.biriktirilgan.label}: ${mln(b)} mln (${pct1(b, t)})`} />
        <Legend color={SERIES.tolangan.color} label={`${SERIES.tolangan.label}: ${mln(u)} mln`} line />
      </div>
      <div className="overflow-x-auto px-2 pb-2 pt-1">
        <DayChart points={points} />
      </div>
      <details className="border-t border-border">
        <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-slate-600 hover:bg-muted/40">Jadval ko&apos;rinishida</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={th}>Sana</th>
                <th className={thR}>Tushum</th>
                <th className={thR}>Biriktirilgan</th>
                <th className={thR}>Biriktirilmagan</th>
                <th className={thR}>G&apos;aznachilik to&apos;lagan</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.d} className="border-b border-border last:border-0">
                  <td className={`${td} tabular-nums`}>{dmy(p.d)}</td>
                  <td className={tdR}>{mln(p.tushum)}</td>
                  <td className={tdR}>{mln(p.biriktirilgan)}</td>
                  <td className={cn(tdR, p.tushum - p.biriktirilgan >= 50_000 && "text-red-700")}>{mln(p.tushum - p.biriktirilgan)}</td>
                  <td className={tdR}>{mln(p.tolangan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
          Summalar mln so&apos;m. G&apos;aznachilik to&apos;lagan — shu kuni ijro etilgan topshiriqnomalar (pul oqimi); tushum
          va biriktirilgan — hujjat sanasi bo&apos;yicha. Kunlar kesimida biriktirish keyingi kunlarga surilishi mumkin.
        </p>
      </details>
    </Card>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-700">
      <span aria-hidden className={line ? "h-0.5 w-4 rounded" : "size-2.5 rounded-sm"} style={{ background: color }} />
      {label}
    </span>
  );
}
