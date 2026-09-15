import ExcelJS from "exceljs";
import { getCurrentUser, isModerator } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { projectConfigured, projectErrorMessage } from "@/lib/projectDb";
import { CHANNELS } from "@/lib/channels";
import { sendState, shareState } from "@/lib/uzasbo";
import { dmy, nowTashkent } from "@/lib/format";
import { getDistribution } from "@/server/services/taqsimot";

export const dynamic = "force-dynamic";

/**
 * Bitta to'lov hujjati taqsimoti — Excel (4 varaq: hujjat, kanallar, qismlar, topshiriqnomalar).
 * Sahifa bilan AYNAN bir xil ma'lumot (`getDistribution`).
 * ⚠️ Hozircha faqat adminlar (foydalanuvchi qarori, 2026-09-15) — `getCurrentUser()` moderatorni
 * ham o'tkazadi, shuning uchun tekshiruv shu yerda.
 * ⚠️ To'lovchi va BS ma'lumotlari bor — har eksport auditga yoziladi.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Avtorizatsiya talab qilinadi", { status: 401 });
  if (isModerator(user)) return text("Ruxsat yo'q", 403);
  if (!projectConfigured()) return text("To'lovlar bazasi sozlanmagan", 503);

  const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
  if (!/^\d{1,18}$/.test(id)) return text("Hujjat ID noto'g'ri", 400);

  let d;
  try {
    d = await getDistribution(id);
  } catch (e) {
    console.error("[taqsimot:export]", e);
    return text(projectErrorMessage(e), 502);
  }
  if (!d) return text("Hujjat topilmadi", 404);

  await audit(user.id, "EXPORT_TAQSIMOT", { hujjat: id, qismlar: d.items.length, topshiriqnomalar: d.sends.length });

  const wb = new ExcelJS.Workbook();
  const money = "#,##0.00";
  const head = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07102B" } };
    r.alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const total = (r: ExcelJS.Row) => {
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F1E4" } };
  };

  // 1. Hujjat
  const { doc } = d;
  const s1 = wb.addWorksheet("Hujjat");
  s1.columns = [{ width: 32 }, { width: 100, style: { alignment: { wrapText: true, vertical: "top" } } }];
  const kv: [string, string | number | null][] = [
    ["Hujjat ID", doc.id],
    ["Raqami", doc.docNum],
    ["Sanasi", dmy(doc.docDate)],
    ["Turi", doc.type],
    ["Holati", doc.active ? "faol" : "faol emas (state ≠ 1)"],
    ["Summa", doc.asum],
    ["To'lovchi", doc.payer],
    ["Qabul qiluvchi", doc.receiver],
    ["To'lov maqsadi", doc.note],
    ["Hudud", [doc.region, doc.district].filter(Boolean).join(" · ") || null],
    ["Qismlarga biriktirilgan", d.attached.s],
    ["Faol qismlar soni", d.attached.n],
    ["Qoldiq (hujjat − biriktirilgan)", doc.asum - d.attached.s],
    ["Kanallarga taqsimlangan", d.channelsSum],
    ["G'aznachilikda to'langan", d.paidSum],
    ["Yuklab olingan", nowTashkent()],
  ];
  for (const [k, v] of kv) {
    const r = s1.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    if (typeof v === "number") r.getCell(2).numFmt = money;
    r.getCell(2).alignment = { horizontal: "left", wrapText: true, vertical: "top" };
  }

  // 2. Kanallar
  const s2 = wb.addWorksheet("Kanallar");
  s2.columns = [
    { header: "Kanal", width: 20 },
    { header: "Ulush", width: 18, style: { numFmt: money } },
    { header: "Tasdiqlangan", width: 18, style: { numFmt: money } },
    { header: "Topshiriqnomaga kiritilgan", width: 20, style: { numFmt: money } },
    { header: "G'aznachilikda to'langan", width: 20, style: { numFmt: money } },
    { header: "To'lanmagan", width: 18, style: { numFmt: money } },
    { header: "Oxirgi to'lov sanasi", width: 14 },
    { header: "Ikki marta to'langan (ortiqcha)", width: 20, style: { numFmt: money } },
    { header: "Belgi bor, topshiriqnoma yo'q", width: 20, style: { numFmt: money } },
  ];
  head(s2);
  const chs = d.channels.filter((c) => c.share > 0 || c.included > 0 || c.paid > 0);
  const add = (k: "share" | "accepted" | "included" | "paid" | "extraPaid" | "noSend") => chs.reduce((a, c) => a + c[k], 0);
  total(s2.addRow(["JAMI", add("share"), add("accepted"), add("included"), add("paid"), Math.max(0, add("share") - add("paid")), null, add("extraPaid"), add("noSend")]));
  for (const c of chs) {
    s2.addRow([c.label, c.share, c.accepted, c.included, c.paid, Math.max(0, c.share - c.paid), c.lastPaid ? dmy(c.lastPaid) : null, c.extraPaid || null, c.noSend || null]);
  }

  // 3. Qismlar — har kanal ulushi alohida ustunda, holati matnda.
  const s3 = wb.addWorksheet("Qismlar");
  s3.columns = [
    { header: "Biriktirish ID", width: 14 },
    { header: "Holat", width: 10 },
    { header: "Biriktirilgan", width: 17 },
    { header: "Shartnoma raqami", width: 20 },
    { header: "Faol shartnoma", width: 10 },
    { header: "Balansda saqlovchi", width: 36 },
    { header: "BS STIR", width: 12 },
    { header: "Summa", width: 16, style: { numFmt: money } },
    ...CHANNELS.map((c) => ({ header: c.label, width: 14, style: { numFmt: money } })),
    { header: "Kanallar holati", width: 60 },
  ];
  head(s3);
  for (const it of d.items) {
    const states = CHANNELS.flatMap((c) => {
      const sh = it.shares[c.key];
      return sh ? [`${c.label}: ${shareState(sh.accepted, sh.sent, it.paidTimes[c.key] ?? 0).label}`] : [];
    });
    s3.addRow([
      it.id,
      it.active ? "faol" : "bekor",
      dmy(it.createdAt, true),
      it.contractNumber,
      it.contractNumber ? (it.contractActive ? "ha" : "yo'q") : null,
      it.ownerName,
      it.ownerTin,
      it.asum,
      ...CHANNELS.map((c) => it.shares[c.key]?.sum ?? null),
      states.join("; "),
    ]);
  }

  // 4. Topshiriqnomalar
  const s4 = wb.addWorksheet("Topshiriqnomalar");
  s4.columns = [
    { header: "ID", width: 10 },
    { header: "Kanal", width: 18 },
    { header: "Oluvchi", width: 40 },
    { header: "Davr", width: 24 },
    { header: "Holat", width: 22 },
    { header: "UzASBO kodi", width: 10 },
    { header: "Sabab", width: 50 },
    { header: "G'aznachilik sanasi", width: 14 },
    { header: "Yaratilgan", width: 17 },
    { header: "Topshiriqnoma summasi", width: 20, style: { numFmt: money } },
    { header: "Hujjat ulushi", width: 18, style: { numFmt: money } },
    { header: "Hujjat qismlari", width: 10 },
    { header: "Jami qismlar", width: 10 },
    { header: "Rad etilgan o'rniga", width: 12 },
    { header: "Bu hujjat uchun", width: 34 },
  ];
  head(s4);
  for (const s of d.sends) {
    s4.addRow([
      s.id,
      s.channelLabel,
      s.receiverName,
      `${dmy(s.dateFrom)} — ${dmy(s.dateTo)}`,
      sendState(s.status, s.uzasboStatus).label,
      s.uzasboStatus,
      s.reason,
      s.treasDate ? dmy(s.treasDate) : null,
      dmy(s.createdAt, true),
      s.receiverSum,
      s.docShare,
      s.ourIds.length,
      s.itemCount,
      s.recreated,
      s.role === "asosiy"
        ? "asosiy"
        : s.role === "tarix"
          ? "tarix (rad etilgan / qayta yaratilgan)"
          : "takroriy ro'yxat — summaga kirmaydi",
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="taqsimot-${id}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
