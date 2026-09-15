import ExcelJS from "exceljs";
import { getCurrentUser, isModerator } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { parseFilters, type SP } from "@/lib/filters";
import { dmy, todayTashkent } from "@/lib/format";
import { getRegions, type Option } from "@/server/services/payments";
import {
  BIR_TYPES,
  getBirDocSummary,
  isBirDocHolat,
  isBirType,
  listBirDocs,
  type BirDoc,
  type BirDocSel,
  type BirDocSummary,
} from "@/server/services/taqsimot";

export const dynamic = "force-dynamic";

/**
 * Biriktirish — bitta hudud hujjatlari, Excel. Sahifa bilan AYNAN bir xil filtr (`BirDocSel`), so'mda,
 * JAMI qatori birinchi, hujjatlar sana bo'yicha o'sib (eski tizimdagidek).
 * ⚠️ Hozircha faqat adminlar. To'lovchi ma'lumoti bor — har eksport auditda.
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
  const holatRaw = sp.holat as string | undefined;
  const turRaw = sp.tur as string | undefined;
  const regions = await getRegions().catch((): Option[] => []);
  const region = regions.find((r) => r.id === f.obl && r.id > 0);
  if (!region) return text("Hudud topilmadi", 404);

  const sel: BirDocSel = {
    obl: region.id,
    from,
    to,
    holat: isBirDocHolat(holatRaw) ? holatRaw : "hammasi",
    tur: isBirType(turRaw) ? turRaw : undefined,
  };

  let summary: BirDocSummary;
  let docs: BirDoc[];
  try {
    summary = await getBirDocSummary(sel);
    if (summary.n > env.EXPORT_MAX_ROWS) {
      return text(`Natija ${summary.n} qator — eksport chegarasi ${env.EXPORT_MAX_ROWS}. Sana oralig'ini toraytiring.`, 400);
    }
    docs = await listBirDocs(sel, env.EXPORT_MAX_ROWS);
  } catch (e) {
    console.error("[taqsimot:biriktirish:hujjatlar:export]", e);
    return text(projectErrorMessage(e), 502);
  }

  await audit(user.id, "EXPORT_BIRIKTIRISH_DOCS", {
    hudud: region.id,
    dan: from ?? null,
    gacha: to,
    holat: sel.holat,
    tur: sel.tur ?? null,
    qatorlar: docs.length,
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hujjatlar", { views: [{ state: "frozen", ySplit: 2 }] });
  const cols = 9 + BIR_TYPES.length + 1;
  ws.columns = [
    { width: 6 },
    { width: 12, style: { numFmt: "dd.mm.yyyy" } },
    { width: 13 },
    { width: 10 },
    { width: 40, style: { alignment: { wrapText: true, vertical: "top" } } },
    { width: 70, style: { alignment: { wrapText: true, vertical: "top" } } },
    ...Array.from({ length: cols - 6 }, () => ({ width: 15, style: { numFmt: "#,##0.00" } })),
  ];

  ws.mergeCells(1, 1, 1, cols);
  const title = ws.getCell(1, 1);
  title.value =
    `${region.name} bo'yicha ${from ? dmy(from) : "boshidan"} — ${dmy(to)} ijara to'lovlaridan tushgan ` +
    "mablag'larning biriktirilishi (so'm)";
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 30;

  const head = ws.addRow([
    "№", "Sana", "ID", "Raqami", "To'lovchi", "Maqsadi", "Tushum", "Biriktirilmagan", "Biriktirilgan",
    ...BIR_TYPES.map((t) => t.label), "MUNIS orqali",
  ]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let c = 1; c <= cols; c++) head.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07102B" } };
  head.height = 30;

  const jami = ws.addRow([
    null, null, null, null, "JAMI", `${summary.n} ta hujjat`, summary.tushum, summary.farq, summary.biriktirilgan,
    ...BIR_TYPES.map((t) => summary.types[t.key]), summary.munis,
  ]);
  jami.font = { bold: true };
  jami.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F1E4" } };

  const asDate = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
  docs.forEach((d, i) =>
    ws.addRow([
      i + 1, asDate(d.docDate), Number(d.id), d.docNum, d.payer, d.note, d.tushum, d.farq, d.biriktirilgan,
      ...BIR_TYPES.map((t) => d.types[t.key]), d.munis,
    ]),
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="biriktirish-${region.id}-${from ?? "boshidan"}-${to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
