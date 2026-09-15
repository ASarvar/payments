import ExcelJS from "exceljs";
import { getCurrentUser, isModerator } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, type SP } from "@/lib/filters";
import { dmy, todayTashkent } from "@/lib/format";
import { BIR_TYPES, getBiriktirish, totalBir, type BirRow } from "@/server/services/taqsimot";

export const dynamic = "force-dynamic";

/**
 * "Biriktirish borishi" — Excel, sahifa bilan AYNAN bir xil ma'lumot (`getBiriktirish`), mln so'mda.
 * Shakl mavjud tizimdagi hisobotdek (ikki qavatli sarlavha), JAMI qatori — birinchi.
 * ⚠️ Hozircha faqat adminlar — `getCurrentUser()` moderatorni ham o'tkazadi, tekshiruv shu yerda.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Avtorizatsiya talab qilinadi", { status: 401 });
  if (isModerator(user)) return text("Ruxsat yo'q", 403);
  if (!projectConfigured()) return text("To'lovlar bazasi sozlanmagan", 503);

  const sp = Object.fromEntries(new URL(req.url).searchParams) as SP;
  const { f } = parseFilters(sp);
  const from = f.from;
  const to = f.to ?? todayTashkent();
  if (from && from > to) return text("Boshlanish sanasi oxirgi sanadan keyin", 400);

  let rows: BirRow[];
  try {
    rows = await getBiriktirish(from, to);
  } catch (e) {
    console.error("[taqsimot:biriktirish:export]", e);
    return text(projectErrorMessage(e), 502);
  }

  await audit(user.id, "EXPORT_BIRIKTIRISH", { dan: from ?? null, gacha: to });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Biriktirish", { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  const cols = 8 + BIR_TYPES.length + 1; // №, hudud, bir kunda ×3, tushum, biriktirilmagan, biriktirilgan, turlar, MUNIS
  ws.columns = [{ width: 5 }, { width: 22 }, ...Array.from({ length: cols - 2 }, () => ({ width: 13 }))];

  ws.mergeCells(1, 1, 1, cols);
  const title = ws.getCell(1, 1);
  title.value =
    `Respublika bo'yicha ${from ? `${dmy(from)} dan` : "boshidan"} ${dmy(to)} gacha ijara to'lovlaridan ` +
    "tushgan mablag'lar biriktirilishining borishi (mln so'm)";
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 32;

  const typeGap = Array<null>(BIR_TYPES.length).fill(null);
  ws.addRow(["№", "Hudud", `Bir kunda (${dmy(to)})`, null, null, "Tushum", "Biriktirilmagan", "Biriktirilgan", "Shundan", ...typeGap]);
  ws.addRow([null, null, "Tushum", "Biriktirilgan", "Biriktirilmagan", null, null, null, ...BIR_TYPES.map((t) => t.label), "MUNIS orqali"]);
  for (const [c1, c2] of [[1, 1], [2, 2], [6, 6], [7, 7], [8, 8]]) ws.mergeCells(2, c1, 3, c2);
  ws.mergeCells(2, 3, 2, 5);
  ws.mergeCells(2, 9, 2, cols);
  for (const r of [2, 3]) {
    const row = ws.getRow(r);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (let c = 1; c <= cols; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07102B" } };
    }
  }
  ws.getRow(3).height = 30;

  const vals = (r: BirRow) =>
    [r.day.tushum, r.day.biriktirilgan, r.day.farq, r.tushum, r.farq, r.biriktirilgan, ...BIR_TYPES.map((t) => r.types[t.key]), r.munis].map(
      (v) => v / 1e6,
    );
  const jami = ws.addRow([null, "JAMI", ...vals(totalBir(rows))]);
  jami.font = { bold: true };
  jami.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F1E4" } };
  rows.forEach((r, i) => ws.addRow([i + 1, r.name, ...vals(r)]));
  for (let c = 3; c <= cols; c++) ws.getColumn(c).numFmt = "#,##0.00";

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="biriktirish-${from ?? "boshidan"}-${to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
