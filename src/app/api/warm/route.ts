import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { channelByKey } from "@/lib/channels";
import { parseFilters } from "@/lib/filters";
import { todayTashkent } from "@/lib/format";
import { projectConfigured } from "@/lib/projectDb";
import { getRegionMatrix } from "@/server/services/payments";
import { getBiriktirish, getDoublePaid, getProblemSummary } from "@/server/services/taqsimot";
import { getDynamics } from "@/server/services/nazorat";
import { getUnpaidSent } from "@/server/services/unpaidItems";

export const dynamic = "force-dynamic";

/**
 * KESH ISITISH — serverdagi cron shu yo'lni chaqiradi (DEPLOY.md §6), shunda nazorat panelini
 * birinchi ochgan odam og'ir hisobni kutmaydi.
 *
 * ⚠️ Sessiya YO'Q: chaqiruvchi `WARM_TOKEN` ni biladi (`X-Warm-Token` sarlavhasi yoki `?key=`).
 *    Token sozlanmagan bo'lsa yo'l umuman yo'q (404) — standart holatda yopiq.
 * ⚠️ Javobda BIZNES MA'LUMOTI yo'q — faqat qaysi hisob necha millisekund olgani.
 * ⚠️ `middleware.ts` matcher'ida bu yo'l login tekshiruvidan chetlatilgan — himoya SHU YERDA.
 */
export async function GET(req: Request) {
  const token = env.WARM_TOKEN;
  if (!token) return text("Kesh isitish sozlanmagan", 404);

  const url = new URL(req.url);
  const given = req.headers.get("x-warm-token") ?? url.searchParams.get("key") ?? "";
  if (!sameSecret(given, token)) return text("Ruxsat yo'q", 403);
  if (!projectConfigured()) return text("To'lovlar bazasi sozlanmagan", 503);

  // ⚠️ Nazorat paneli bilan AYNAN bir xil argumentlar — aks holda boshqa kesh kaliti isib,
  //    sahifa baribir qayta hisoblardi.
  const { f } = parseFilters({});
  const to = f.to ?? todayTashkent();

  // Qo'shimcha: ro'yxatdagi "to'langan/topshiriqnomada" filtri uchun kanal to'plamlari
  // (`?kanallar=vat,owner`). Standart bo'yicha YO'Q — har biri alohida og'ir so'rov.
  const keys = (url.searchParams.get("kanallar") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const tasks: [string, () => Promise<unknown>][] = [
    ["hudud×kanal", () => getRegionMatrix(f.from, f.to)],
    ["biriktirish", () => getBiriktirish(f.from, to)],
    ["dinamika", () => getDynamics(to, f.obl)],
    ["muammoli", () => getProblemSummary(f)],
    ["takroriy", () => getDoublePaid()],
    ...keys.map((k): [string, () => Promise<unknown>] => [
      `to'lanmagan:${k}`,
      () => {
        const ch = channelByKey(k);
        if (!ch) throw new Error(`noma'lum kanal: ${k}`);
        return getUnpaidSent(ch);
      },
    ]),
  ];

  // Ketma-ket: isitish fonda ishlaydi, begona bazaga bir vaqtda zarba bermasin.
  const natija: Record<string, string> = {};
  for (const [nom, fn] of tasks) {
    const t0 = Date.now();
    try {
      await fn();
      natija[nom] = `${Date.now() - t0} ms`;
    } catch (e) {
      natija[nom] = `xato: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
    }
  }
  console.log("[warm]", JSON.stringify(natija));
  return Response.json({ ok: !Object.values(natija).some((v) => v.startsWith("xato")), natija });
}

/** Uzunligi turlicha bo'lsa ham vaqt bo'yicha sir ochilmasin — ikkalasi avval xeshlanadi. */
function sameSecret(a: string, b: string): boolean {
  const h = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(h(a), h(b));
}

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
