import ExcelJS from "exceljs";
import { getCurrentUser, isModerator } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, type SP } from "@/lib/filters";
import { dmy, nowTashkent } from "@/lib/format";
import { getRegions, type PaymentFilters } from "@/server/services/payments";
import { getYonalishlar, type Yonalishlar } from "@/server/services/yonalishlar";

export const dynamic = "force-dynamic";

/**
 * "Yo'nalishlar bo'yicha" — Excel, sahifa bilan AYNAN bir xil (`getYonalishlar`): 1-varaq
 * yo'nalishlar (so'm), 2-varaq yo'nalish × hudud "chiqishi kerak" (mln so'm).
 * ⚠️ Hozircha faqat adminlar — `getCurrentUser()` moderatorni ham o'tkazadi, tekshiruv shu yerda.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Avtorizatsiya talab qilinadi", { status: 401 });
  if (isModerator(user)) return text("Ruxsat yo'q", 403);
  if (!projectConfigured()) return text("To'lovlar bazasi sozlanmagan", 503);

  const sp = Object.fromEntries(new URL(req.url).searchParams) as SP;
  const parsed = parseFilters(sp);
  const f: PaymentFilters = { from: parsed.f.from, to: parsed.f.to, obl: parsed.f.obl };
  if (f.from && f.to && f.from > f.to) return text("Boshlanish sanasi oxirgi sanadan keyin", 400);

  let d: Yonalishlar;
  let scope = "Respublika";
  try {
    d = await getYonalishlar(f);
    if (f.obl !== undefined) {
      const regions = await getRegions().catch(() => []);
      scope = regions.find((r) => r.id === f.obl)?.name ?? `#${f.obl}`;
    }
  } catch (e) {
    console.error("[yonalishlar:export]", e);
    return text(projectErrorMessage(e), 502);
  }

  await audit(user.id, "EXPORT_YONALISHLAR", { dan: f.from ?? null, gacha: f.to ?? null, hudud: f.obl ?? null });

  const period = `${f.from ? dmy(f.from) : "boshidan"} — ${f.to ? dmy(f.to) : dmy(nowTashkent().slice(0, 10))}`;
  const wb = new ExcelJS.Workbook();
  const navy = "FF07102B";
  const gold = "FFF7F1E4";

  // ── 1-varaq: yo'nalishlar ──
  const ws = wb.addWorksheet("Yo'nalishlar", { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  const cols = 9;
  ws.columns = [{ width: 5 }, { width: 24 }, ...Array.from({ length: cols - 2 }, () => ({ width: 18 }))];
  ws.mergeCells(1, 1, 1, cols);
  const title = ws.getCell(1, 1);
  title.value = `${scope} bo'yicha to'lovlarning yo'nalishlar kesimi (so'm; to'lov sanasi ${period})`;
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 30;

  ws.addRow(["№", "Yo'nalish", "Hisoblangan", "To'langan", "Ulushi, %", "Chiqishi kerak", "Shundan", null, null]);
  ws.addRow([null, null, null, null, null, null, "Tasdiqlanmagan", "Tasdiqlangan, kiritilmagan", "Topshiriqnomada"]);
  for (const c of [1, 2, 3, 4, 5, 6]) ws.mergeCells(2, c, 3, c);
  ws.mergeCells(2, 7, 2, 9);
  for (const r of [2, 3]) {
    const row = ws.getRow(r);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (let c = 1; c <= cols; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  }
  ws.getRow(2).height = 28;

  const share = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  const vals = (r: Yonalishlar["total"]) => [
    r.m.jami.s,
    r.m.tolangan.s,
    share(r.m.tolangan.s, r.m.jami.s),
    r.qoldiq,
    r.m.tasdiqlanmagan.s,
    r.m.otkazilmagan.s,
    r.m.topshiriqnomada.s,
  ];
  const jami = ws.addRow([null, "JAMI", ...vals(d.total)]);
  jami.font = { bold: true };
  jami.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gold } };
  d.rows.forEach((r, i) => ws.addRow([i + 1, r.label, ...vals(r)]));
  for (let c = 3; c <= cols; c++) ws.getColumn(c).numFmt = c === 5 ? "#,##0.0" : "#,##0.00";

  // ── 2-varaq: yo'nalish × hudud (chiqishi kerak) ──
  const ws2 = wb.addWorksheet("Yo'nalish × hudud", { views: [{ state: "frozen", xSplit: 2, ySplit: 2 }] });
  const cols2 = 2 + d.regions.length + 1;
  ws2.columns = [{ width: 5 }, { width: 24 }, ...d.regions.map(() => ({ width: 14 })), { width: 16 }];
  ws2.mergeCells(1, 1, 1, cols2);
  const title2 = ws2.getCell(1, 1);
  title2.value = `Yo'nalish va hududlar bo'yicha chiqishi kerak bo'lgan summa (mln so'm; to'lov sanasi ${period})`;
  title2.font = { bold: true, size: 12 };
  title2.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws2.getRow(1).height = 30;

  const head = ws2.addRow(["№", "Yo'nalish", ...d.regions.map((r) => r.name), "Jami"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  head.height = 30;
  for (let c = 1; c <= cols2; c++) head.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };

  const m = (v: number) => v / 1e6;
  const jami2 = ws2.addRow([null, "JAMI", ...d.regions.map((reg) => m(d.total.byRegion[reg.id] ?? 0)), m(d.total.qoldiq)]);
  jami2.font = { bold: true };
  jami2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gold } };
  d.rows.forEach((r, i) => ws2.addRow([i + 1, r.label, ...d.regions.map((reg) => m(r.byRegion[reg.id] ?? 0)), m(r.qoldiq)]));
  for (let c = 3; c <= cols2; c++) ws2.getColumn(c).numFmt = "#,##0.00";

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="yonalishlar-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
