import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { CHANNELS, channelByKey, isHolat, type Holat } from "@/lib/channels";
import { parseFilters, type SP } from "@/lib/filters";
import { nowTashkent } from "@/lib/format";
import { exportChunks, rowHolatLabel, selectionSummary, type Selection } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/**
 * Excel eksport — ro'yxat sahifasidagi filtrlar bilan AYNAN bir xil (bir xil
 * `Selection`), shuning uchun fayldagi son ekrandagidan farq qilmaydi.
 *
 * Shakl foydalanuvchining hisobot SQL'i bo'yicha: ustunlar o'sha tartibda,
 * BIRINCHI qator — JAMI (ulushlar yig'indisi, "Tuman" ustunida yaratilgan vaqt).
 *
 * ⚠️ OQIM (stream) bilan yoziladi — 300 000 qatorlik fayl xotiraga to'liq yig'ilmaydi.
 * ⚠️ Tartib — `pi.id` bo'yicha (SQL'dagi "Biriktirish sanasi" bilan amalda bir xil:
 *    id yaratilish tartibida o'sadi). Kalit bo'yicha o'qish tez va barqaror.
 * ⚠️ Hisob raqamlari bor — har eksport auditga yoziladi.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Avtorizatsiya talab qilinadi", { status: 401 });
  if (!projectConfigured()) return text("To'lovlar bazasi sozlanmagan", 503);

  const sp = Object.fromEntries(new URL(req.url).searchParams) as SP;
  const ch = channelByKey(sp.kanal as string | undefined) ?? CHANNELS[0];
  const holat: Holat = isHolat(sp.holat as string | undefined) ? (sp.holat as Holat) : "otkazilmagan";
  const { f } = parseFilters(sp, ch);
  const q = (sp.q as string | undefined)?.trim() || undefined;
  const sel: Selection = { channel: ch.key, holat, f, q };

  let summary;
  try {
    summary = await selectionSummary(sel);
  } catch (e) {
    console.error("[export]", e);
    return text(projectErrorMessage(e), 502);
  }
  if (summary.n > env.EXPORT_MAX_ROWS) {
    return text(`Natija ${summary.n} qator — eksport chegarasi ${env.EXPORT_MAX_ROWS}. Filtrni toraytiring.`, 400);
  }

  await audit(user.id, "EXPORT", {
    kanal: ch.key,
    holat,
    dan: f.from ?? null,
    gacha: f.to ?? null,
    hudud: f.obl ?? null,
    tuman: f.area ?? null,
    q: q ?? null,
    qatorlar: summary.n,
  });

  const pass = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: pass, useStyles: true, useSharedStrings: false });
  const sheet = wb.addWorksheet("To'lovlar", { views: [{ state: "frozen", ySplit: 1 }] });
  const money = { numFmt: "#,##0.00" };
  sheet.columns = [
    { header: "Biriktirish ID si", width: 14 },
    { header: "To‘lov ID si", width: 14 },
    { header: "To‘lov sanasi", width: 13, style: { numFmt: "dd.mm.yyyy" } },
    { header: "Biriktirish sanasi", width: 18, style: { numFmt: "dd.mm.yyyy hh:mm" } },
    { header: "Yangilanish sanasi", width: 18, style: { numFmt: "dd.mm.yyyy hh:mm" } },
    { header: "Jami summa", width: 18, style: money },
    { header: `${ch.label} ulushi`, width: 18, style: money },
    { header: "Viloyat", width: 18 },
    { header: "Tuman", width: 22 },
    { header: "Shartnoma raqami", width: 20 },
    { header: "Stir BS", width: 12 },
    { header: "Balansda saqlovchi", width: 40 },
    { header: "BS MFO", width: 10 },
    { header: "BS hisob raqami", width: 24 },
    { header: "Holat", width: 22 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07102B" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.commit();

  const total = sheet.addRow([null, null, null, null, null, null, summary.s, `JAMI ${ch.label.toUpperCase()}`, nowTashkent()]);
  total.font = { bold: true };
  total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F1E4" } };
  total.commit();

  const asDate = (s: string | null) => (s ? new Date(`${s.replace(" ", "T")}Z`) : null);

  void (async () => {
    for await (const chunk of exportChunks(sel)) {
      for (const r of chunk) {
        sheet
          .addRow([
            Number(r.id),
            r.payId ? Number(r.payId) : null,
            asDate(r.docDate),
            asDate(r.createdAt),
            asDate(r.updatedAt),
            r.asum,
            r.share,
            r.region,
            r.district,
            r.contractNumber,
            r.ownerTin,
            r.ownerName,
            r.ownerMfo,
            r.ownerAccount,
            rowHolatLabel(r),
          ])
          .commit();
      }
    }
    sheet.commit();
    await wb.commit();
  })().catch((e) => {
    // ⚠️ Javob allaqachon boshlangan — faqat oqimni uzamiz (fayl chala qoladi, brauzer xato ko'rsatadi).
    console.error("[export] oqim uzildi:", e);
    pass.destroy(e instanceof Error ? e : new Error(String(e)));
  });

  const fileName = `tolovlar-${ch.key}-${holat}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(Readable.toWeb(pass) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
