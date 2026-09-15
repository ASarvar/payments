/**
 * To'lov taqsimoti KANALLARI — `payment_items` dagi har bir oluvchi.
 *
 * Har bir to'lov (`asum`) bir nechta oluvchiga bo'linadi; har bir ulushning o'z
 * summasi (`*_sum`), "tasdiqlandi" (`*_accept`) va "o'tkazildi" (`sent_*`)
 * belgisi bor. Hammasi jonli sxemadan olingan (server, 2026-09-11).
 *
 * ⚠️ Ustun nomlari BU YERDAN SQL'ga `Prisma.raw` bilan tushadi — ro'yxat qat'iy
 * (whitelist), foydalanuvchi kiritgan qiymat hech qachon ustun nomiga aylanmaydi:
 * URL'dagi `kanal` shu ro'yxatdagi `key` bilan solishtiriladi.
 *
 * ⚠️ Mudofaa kanalida sxemaning O'ZIDA imlo farqi bor: summa `defense_sum`,
 * belgilar esa `defence_accept` / `sent_defence`. Tuzatmang — jadval shunday.
 *
 * Yorliqlar ustun nomidan olingan; "Pochta", "Markaz", "Balansda saqlovchi" 2026-09-15 da
 * `uzasbo_send` oluvchi nomlari bilan tasdiqlandi. Rasmiy nom boshqacha bo'lsa — faqat `label`.
 */
export interface Channel {
  key: string;
  label: string;
  sum: string;
  accept: string;
  sent: string;
  /**
   * `uzasbo_send.receiver_type` — g'aznachilikka topshiriqnomadagi oluvchi turi. Jonli bazada
   * oluvchi nomlari va summalar tengligi bilan aniqlangan (2026-09-15).
   * ⚠️ 11 (Ekologiya) — TAXMIN: bazada bu turdagi topshiriqnoma hali yo'q.
   */
  rt: number;
}

// Standart sana filtri kanalga bog'liq EMAS — hammasiga bir xil (`lib/filters.ts` → `DEFAULT_FROM`).
export const CHANNELS: readonly Channel[] = [
  { key: "vat", label: "QQS", sum: "vat_sum", accept: "vat_accept", sent: "sent_vat", rt: 1 },
  { key: "mahalliy", label: "Mahalliy budjet", sum: "mahalliy_sum", accept: "mahalliy_accept", sent: "sent_mahalliy", rt: 2 },
  { key: "owner", label: "Balansda saqlovchi", sum: "owner_sum", accept: "owner_accept", sent: "sent_owner", rt: 4 },
  { key: "center", label: "Markaz", sum: "center_sum", accept: "center_accept", sent: "sent_center", rt: 5 },
  { key: "madaniy", label: "Madaniy meros", sum: "madaniy_sum", accept: "madaniy_accept", sent: "sent_madaniy", rt: 3 },
  { key: "sport", label: "Sport", sum: "sport_sum", accept: "sport_accept", sent: "sent_sport", rt: 6 },
  { key: "defence", label: "PF-16", sum: "defense_sum", accept: "defence_accept", sent: "sent_defence", rt: 7 },
  { key: "eco", label: "Ekologiya", sum: "eco_sum", accept: "eco_accept", sent: "sent_eco", rt: 11 },
  { key: "medicine", label: "Tibbiyot", sum: "medicine_sum", accept: "medicine_accept", sent: "sent_medicine", rt: 12 },
  { key: "penya", label: "Penya", sum: "penya_sum", accept: "penya_accept", sent: "sent_penya", rt: 8 },
  { key: "jarima", label: "Jarima", sum: "jarima_sum", accept: "jarima_accept", sent: "sent_jarima", rt: 9 },
  { key: "mail", label: "Pochta", sum: "mail_sum", accept: "mail_accept", sent: "sent_mail", rt: 10 },
];

const BY_KEY = new Map(CHANNELS.map((c) => [c.key, c]));
const BY_RT = new Map(CHANNELS.map((c) => [c.rt, c]));

/** URL'dagi kalit → kanal. Noma'lum kalit — `undefined` (SQL'ga hech narsa tushmaydi). */
export function channelByKey(key: string | undefined | null): Channel | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** `uzasbo_send.receiver_type` → kanal (noma'lum tur — `undefined`). */
export function channelByRt(rt: number): Channel | undefined {
  return BY_RT.get(rt);
}

/**
 * Ulush HOLATLARI. `tolangan` / `topshiriqnomada` / `otkazilmagan` / `tasdiqlanmagan` bitta kanal
 * ichida qatorlarni TO'LIQ va kesishmasdan bo'ladi:
 * jami = to'langan + topshiriqnomada + o'tkazilmagan + tasdiqlanmagan.
 *
 * ⚠️ "O'tkazilgan" (`sent_*` belgisi) — topshiriqnomaga KIRITILGAN, g'aznachilik to'lagani emas.
 * 2026-09-15 dan ikkiga bo'lingan (foydalanuvchi qarori): "To'langan" (g'aznachilik ijro etgan,
 * `lib/uzasbo.ts`) va "Topshiriqnomada" (kiritilgan, hali to'lanmagan). `otkazilgan` — ikkalasi
 * birga (eski havolalar uchun ham).
 * ⚠️ "O'tkazilmagan" = tasdiqlangan VA `sent IS NOT TRUE` — `false` va `NULL`
 * orasida farq YO'Q (foydalanuvchi qarori, 2026-09-11). Foydalanuvchining QQS
 * hisoboti aynan shu shart bilan yozilgan.
 * ⚠️ "Anomaliya" — o'tkazilgan, lekin TASDIQLANMAGAN (jonli bazada QQS bo'yicha
 * 254 ta). U "o'tkazilgan" ning ichida, alohida sanaladi.
 * ⚠️ `shartnomasiz` / `rekvizitsiz` — o'tkazilmagan ulushlar ichidan, shartnoma
 * ko'rinishiga (`vw_all_contracts`) JOIN talab qiladi — sekinroq.
 */
export const HOLATLAR = [
  { key: "jami", label: "Hammasi" },
  { key: "otkazilmagan", label: "O'tkazilmagan" },
  { key: "topshiriqnomada", label: "Topshiriqnomada (to'lanmagan)" },
  { key: "tolangan", label: "To'langan" },
  { key: "tasdiqlanmagan", label: "Tasdiqlanmagan" },
  { key: "otkazilgan", label: "Topshiriqnomaga kiritilgan (jami)" },
  { key: "anomaliya", label: "Tasdiqlanmasdan o'tkazilgan" },
  { key: "shartnomasiz", label: "O'tkazilmagan — faol shartnomasiz" },
  { key: "rekvizitsiz", label: "O'tkazilmagan — BS rekvizitisiz" },
] as const;

export type Holat = (typeof HOLATLAR)[number]["key"];

export function isHolat(v: string | undefined): v is Holat {
  return HOLATLAR.some((h) => h.key === v);
}

export function holatLabel(h: Holat): string {
  return HOLATLAR.find((x) => x.key === h)?.label ?? h;
}
