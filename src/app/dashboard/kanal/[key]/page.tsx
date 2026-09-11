import Link from "next/link";
import { notFound } from "next/navigation";
import { Sigma, CheckCircle2, Hourglass, CircleDashed } from "lucide-react";
import { requireUserOrRedirect } from "@/lib/authz";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { CHANNELS, channelByKey } from "@/lib/channels";
import { parseFilters, filterParams, href, one, type SP } from "@/lib/filters";
import {
  AGE_BUCKETS,
  addMetrics,
  emptyMetrics,
  getByDistrict,
  getByRegion,
  getContractIssues,
  type ContractIssues,
  type GroupRow,
  type PaymentFilters,
} from "@/server/services/payments";
import { dmy, money, nf, pct1, sum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/KpiCard";
import { FilterBar } from "@/components/FilterBar";
import { Card, ErrorBox, NotConfigured, PageHeader, th, thR, td, tdR, totalRow, totalStyle } from "@/components/ui";

function totalsOf(rows: GroupRow[]): GroupRow {
  let m = emptyMetrics();
  const aging = Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, 0])) as GroupRow["aging"];
  for (const r of rows) {
    m = addMetrics(m, r.m);
    for (const b of AGE_BUCKETS) aging[b.key] += r.aging[b.key];
  }
  return { id: null, name: "J A M I", m, aging };
}

function MetricCells({ r, list }: { r: GroupRow; list: ((holat: string) => string) | null }) {
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
      <td className={tdR}>{sum(r.m.jami.s)}</td>
      <td className={tdR}>{sum(r.m.otkazilgan.s)}</td>
      <td className={tdR}>{pct1(r.m.otkazilgan.s, r.m.jami.s)}</td>
      <td className={tdR}>
        <L h="otkazilmagan">{nf(r.m.otkazilmagan.n)}</L>
      </td>
      <td className={`${tdR} font-semibold text-amber-800`}>
        <L h="otkazilmagan">{sum(r.m.otkazilmagan.s)}</L>
      </td>
      <td className={tdR}>
        <L h="tasdiqlanmagan">{sum(r.m.tasdiqlanmagan.s)}</L>
      </td>
      <td className={tdR}>
        {r.m.anomaliya.n > 0 ? (
          <L h="anomaliya" className="font-semibold text-red-700">
            {nf(r.m.anomaliya.n)}
          </L>
        ) : (
          "0"
        )}
      </td>
    </>
  );
}

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<SP>;
}) {
  await requireUserOrRedirect();
  const { key } = await params;
  const ch = channelByKey(key);
  if (!ch) notFound();
  if (!projectConfigured()) {
    return (
      <>
        <PageHeader title={`Kanal: ${ch.label}`} />
        <NotConfigured />
      </>
    );
  }

  const sp = await searchParams;
  const parsed = parseFilters(sp, ch);
  // Sahifaning o'zi hududlar KESIMI — hudud/tuman filtri bu yerda qo'llanmaydi.
  const f: PaymentFilters = { from: parsed.f.from, to: parsed.f.to };
  const ochiqRaw = one(sp.ochiq);
  const ochiq = ochiqRaw && /^\d{1,9}$/.test(ochiqRaw) ? Number(ochiqRaw) : undefined;

  const [regR, issuesR, distR] = await Promise.allSettled([
    getByRegion(ch.key, f),
    getContractIssues(ch.key, f),
    ochiq !== undefined ? getByDistrict(ch.key, { ...f, obl: ochiq }) : Promise.resolve(null),
  ]);
  if (regR.status === "rejected") console.error("[kanal]", regR.reason);
  if (issuesR.status === "rejected") console.error("[kanal:issues]", issuesR.reason);

  const regions = regR.status === "fulfilled" ? regR.value : null;
  const issues: ContractIssues | null = issuesR.status === "fulfilled" ? issuesR.value : null;
  const districts = distR.status === "fulfilled" ? distR.value : null;
  const total = regions ? totalsOf(regions) : null;

  // ⚠️ Standart sana (QQS) boshqa kanalga olib o'tilmaydi — `dan` faqat foydalanuvchi
  // o'zi bergan bo'lsa havolaga qo'shiladi.
  const selfParams = { dan: parsed.danExplicit ? (f.from ?? "") : undefined, gacha: f.to };
  const listHref = (obl?: number, area?: number) => (holat: string) =>
    href("/dashboard/royxat", { kanal: ch.key, holat, ...filterParams({ ...f, obl, area }) });

  return (
    <div>
      <PageHeader
        title={`Kanal: ${ch.label}`}
        subtitle={
          <>
            Hududlar kesimida · to&apos;lov sanasi bo&apos;yicha
            {f.from || f.to ? (
              <>
                {" "}
                · {f.from ? dmy(f.from) : "…"} — {f.to ? dmy(f.to) : "…"}
              </>
            ) : (
              <> · barcha davr</>
            )}
            {!parsed.danExplicit && ch.defaultFrom ? <> (standart boshlanish sanasi — o&apos;zgartirish mumkin)</> : null}
          </>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => (
          <Link
            key={c.key}
            href={href(`/dashboard/kanal/${c.key}`, selfParams)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition",
              c.key === ch.key ? "border-transparent text-white" : "border-border bg-card text-slate-600 hover:bg-muted",
            )}
            style={c.key === ch.key ? { background: "var(--navy)" } : undefined}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      <FilterBar values={{ dan: f.from, gacha: f.to }} resetHref={`/dashboard/kanal/${ch.key}`} />

      {regR.status === "rejected" ? <ErrorBox message={projectErrorMessage(regR.reason)} /> : null}

      {regions && total ? (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Hisoblangan" {...money(total.m.jami.s)} footer={`${nf(total.m.jami.n)} ta ulush`} accent="#1a3a7c" icon={Sigma} />
            <KpiCard
              label="O'tkazilgan"
              {...money(total.m.otkazilgan.s)}
              footer={`${pct1(total.m.otkazilgan.s, total.m.jami.s)} · ${nf(total.m.otkazilgan.n)} ta`}
              accent="#15803d"
              icon={CheckCircle2}
            />
            <KpiCard
              label="O'tkazilmagan (tasdiqlangan)"
              {...money(total.m.otkazilmagan.s)}
              footer={`${nf(total.m.otkazilmagan.n)} ta ulush`}
              accent="#c8a96e"
              icon={Hourglass}
              href={listHref()("otkazilmagan")}
            />
            <KpiCard
              label="Tasdiqlanmagan"
              {...money(total.m.tasdiqlanmagan.s)}
              footer={`${nf(total.m.tasdiqlanmagan.n)} ta ulush`}
              accent="#64748b"
              icon={CircleDashed}
              href={listHref()("tasdiqlanmagan")}
            />
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <IssueTile
              title="Tasdiqlanmasdan o'tkazilgan"
              n={total.m.anomaliya.n}
              s={total.m.anomaliya.s}
              href={listHref()("anomaliya")}
            />
            <IssueTile
              title="O'tkazilmagan — faol shartnomasiz"
              n={issues?.shartnomasiz.n}
              s={issues?.shartnomasiz.s}
              href={listHref()("shartnomasiz")}
              failed={issuesR.status === "rejected" ? projectErrorMessage(issuesR.reason) : undefined}
            />
            <IssueTile
              title="O'tkazilmagan — BS hisob raqami/MFO yo'q"
              n={issues?.rekvizitsiz.n}
              s={issues?.rekvizitsiz.s}
              href={listHref()("rekvizitsiz")}
              failed={issuesR.status === "rejected" ? projectErrorMessage(issuesR.reason) : undefined}
            />
          </div>

          <Card title="Hududlar bo'yicha" subtitle="Hudud nomini bosing — tumanlar ochiladi. Summalar so'mda.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={th}>Hudud</th>
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
                    <td className={td}>{total.name}</td>
                    <MetricCells r={total} list={listHref()} />
                  </tr>
                  {regions.map((r) => {
                    const open = r.id !== null && r.id === ochiq;
                    return (
                      <RegionRows
                        key={r.id ?? "null"}
                        r={r}
                        open={open}
                        toggleHref={
                          r.id === null ? null : href(`/dashboard/kanal/${ch.key}`, { ...selfParams, ochiq: open ? undefined : r.id })
                        }
                        list={r.id === null ? null : listHref(r.id)}
                        districts={open ? districts : null}
                        districtList={(area: number) => listHref(r.id ?? undefined, area)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="O'tkazilmagan summaning yoshi"
            subtitle="To'lov sanasidan bugungacha o'tgan kun bo'yicha — qaysi hududda pul uzoq turib qolgani."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className={th}>Hudud</th>
                    {AGE_BUCKETS.map((b) => (
                      <th key={b.key} className={thR}>
                        {b.label}
                      </th>
                    ))}
                    <th className={thR}>Jami o&apos;tkazilmagan</th>
                  </tr>
                </thead>
                <tbody>
                  {[total, ...regions].map((r, i) => (
                    <tr key={i === 0 ? "total" : (r.id ?? "null")} className={i === 0 ? totalRow : "border-b border-border last:border-0"} style={i === 0 ? totalStyle : undefined}>
                      <td className={td}>{r.name}</td>
                      {AGE_BUCKETS.map((b) => (
                        <td key={b.key} className={cn(tdR, b.key === "aOld" && r.aging[b.key] > 0 && "font-semibold text-red-700")}>
                          {sum(r.aging[b.key])}
                        </td>
                      ))}
                      <td className={`${tdR} font-semibold`}>{sum(r.m.otkazilmagan.s)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function RegionRows({
  r,
  open,
  toggleHref,
  list,
  districts,
  districtList,
}: {
  r: GroupRow;
  open: boolean;
  toggleHref: string | null;
  list: ((holat: string) => string) | null;
  districts: GroupRow[] | null;
  districtList: (area: number) => (holat: string) => string;
}) {
  return (
    <>
      <tr className={cn("border-b border-border", open && "bg-muted/40")}>
        <td className={td}>
          {toggleHref ? (
            <Link href={toggleHref} className="font-medium hover:underline" style={{ color: "var(--cobalt)" }}>
              {open ? "▾" : "▸"} {r.name}
            </Link>
          ) : (
            r.name
          )}
        </td>
        <MetricCells r={r} list={list} />
      </tr>
      {open && districts
        ? districts.map((d) => (
            <tr key={`d-${d.id ?? "null"}`} className="border-b border-border bg-muted/20 text-[12.5px]">
              <td className={`${td} pl-8 text-slate-600`}>{d.name}</td>
              <MetricCells r={d} list={d.id === null ? null : districtList(d.id)} />
            </tr>
          ))
        : null}
    </>
  );
}

function IssueTile({
  title,
  n,
  s,
  href: to,
  failed,
}: {
  title: string;
  n?: number;
  s?: number;
  href: string;
  failed?: string;
}) {
  const bad = (n ?? 0) > 0;
  return (
    <Link
      href={to}
      className={cn(
        "block rounded-xl border p-3 transition hover:shadow-sm",
        bad ? "border-red-200 bg-red-50/60 hover:border-red-300" : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <p className="text-[11.5px] font-medium text-muted-foreground">{title}</p>
      {failed ? (
        <p className="mt-1 text-[12px] text-amber-800">{failed}</p>
      ) : n === undefined ? (
        <p className="mt-1 text-[12px] text-muted-foreground">hisoblanmoqda…</p>
      ) : (
        <p className={cn("mt-1 text-lg font-bold", bad ? "text-red-700" : "text-slate-700")}>
          {nf(n)} ta <span className="text-[12px] font-medium text-muted-foreground">· {sum(s ?? 0)} so&apos;m</span>
        </p>
      )}
    </Link>
  );
}
