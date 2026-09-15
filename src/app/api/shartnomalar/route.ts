import ExcelJS from "exceljs";
import { getCurrentUser, isModerator } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { dmy, todayTashkent } from "@/lib/format";
import { FIRST_YEAR, getShartnomalar, totalSh, type ShRow } from "@/server/services/shartnomalar";

export const dynamic = "force-dynamic";

/**
 * "Shartnomalar bo'yicha" — Excel, sahifa bilan AYNAN bir xil (`getShartnomalar`), mln so'mda,
 * ikki qavatli sarlavha, JAMI qatori birinchi.
 * ⚠️ Hozircha faqat adminlar — `getCurrentUser()` moderatorni ham o'tkazadi, tekshiruv shu yerda.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Avtorizatsiya talab qilinadi", { status: 401 });
  if (isModerator(user)) return text("Ruxsat yo'q", 403);
  if (!projectConfigured()) return text("To'lovlar bazasi sozlanmagan", 503);

  const today = todayTashkent();
  const thisYear = Number(today.slice(0, 4));
  const y = Number(new URL(req.url).searchParams.get("yil"));
  const year = Number.isInteger(y) && y >= FIRST_YEAR && y <= thisYear ? y : thisYear;

  let rows: ShRow[];
  try {
    rows = await getShartnomalar(year, today);
  } catch (e) {
    console.error("[shartnomalar:export]", e);
    return text(projectErrorMessage(e), 502);
  }

  await audit(user.id, "EXPORT_SHARTNOMALAR", { yil: year });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Shartnomalar", { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  const cols = 17;
  ws.columns = [{ width: 5 }, { width: 22 }, { width: 10 }, ...Array.from({ length: cols - 3 }, () => ({ width: 13 }))];

  ws.mergeCells(1, 1, 1, cols);
  const title = ws.getCell(1, 1);
  title.value = `Respublika bo'yicha ${year} yilda hisoblangan ijara to'lovlari va penyalar (mln so'm; «bir kunda» — ${dmy(today)})`;
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 32;

  ws.addRow([
    "№", "Hudud", "Shartnomalar", null, "Hisoblandi", null, null, "To'landi — bir kunda", null, null,
    "To'landi — hisobot davrida", null, null, "Debitor qarz", null, null, "Kreditor",
  ]);
  ws.addRow([null, null, "Soni", "Summasi", "Jami", "Ijara", "Penya", "Jami", "Ijara", "Penya", "Jami", "Ijara", "Penya", "Jami", "Ijara", "Penya", null]);
  for (const c of [1, 2, 17]) ws.mergeCells(2, c, 3, c);
  for (const [c1, c2] of [[3, 4], [5, 7], [8, 10], [11, 13], [14, 16]]) ws.mergeCells(2, c1, 2, c2);
  for (const r of [2, 3]) {
    const row = ws.getRow(r);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (let c = 1; c <= cols; c++) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07102B" } };
  }
  ws.getRow(2).height = 30;

  const m = (v: number) => v / 1e6;
  const vals = (r: ShRow) => [
    r.count, m(r.sum),
    m(r.hisob.jami), m(r.hisob.rent), m(r.hisob.penya),
    m(r.day.jami), m(r.day.rent), m(r.day.penya),
    m(r.paid.jami), m(r.paid.rent), m(r.paid.penya),
    m(r.debitor.jami), m(r.debitor.rent), m(r.debitor.penya),
    m(r.creditor),
  ];
  const jami = ws.addRow([null, "JAMI", ...vals(totalSh(rows))]);
  jami.font = { bold: true };
  jami.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F1E4" } };
  rows.forEach((r, i) => ws.addRow([i + 1, r.name, ...vals(r)]));
  ws.getColumn(3).numFmt = "#,##0";
  for (let c = 4; c <= cols; c++) ws.getColumn(c).numFmt = "#,##0.00";

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="shartnomalar-${year}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
