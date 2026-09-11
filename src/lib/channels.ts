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
 * ⚠️ Yorliqlar ustun nomidan taxmin qilingan (masalan `mail` → "Pochta"). Rasmiy
 * nom boshqacha bo'lsa — faqat `label` ni o'zgartiring.
 */
export interface Channel {
  key: string;
  label: string;
  sum: string;
  accept: string;
  sent: string;
  /**
   * Kanal sahifasi to'g'ridan-to'g'ri ochilganda (sana berilmaganda) qo'llanadigan
   * boshlang'ich sana (YYYY-MM-DD, qo'shib hisoblanadi).
   */
  defaultFrom?: string;
}

export const CHANNELS: readonly Channel[] = [
  {
    key: "vat",
    label: "QQS",
    sum: "vat_sum",
    accept: "vat_accept",
    sent: "sent_vat",
    // ⚠️ Foydalanuvchining hisobot SQL'ida `doc_date > '2025-05-13'` (qat'iy katta).
    // Bizning filtr "dan" — QO'SHIB hisoblaydi, shuning uchun 14-may. Standart
    // filtr, qoida emas: foydalanuvchi sanani o'zgartira oladi (qarori, 2026-09-11).
    defaultFrom: "2025-05-14",
  },
  { key: "mahalliy", label: "Mahalliy budjet", sum: "mahalliy_sum", accept: "mahalliy_accept", sent: "sent_mahalliy" },
  { key: "owner", label: "Balansda saqlovchi", sum: "owner_sum", accept: "owner_accept", sent: "sent_owner" },
  { key: "center", label: "Markaz", sum: "center_sum", accept: "center_accept", sent: "sent_center" },
  { key: "madaniy", label: "Madaniyat", sum: "madaniy_sum", accept: "madaniy_accept", sent: "sent_madaniy" },
  { key: "sport", label: "Sport", sum: "sport_sum", accept: "sport_accept", sent: "sent_sport" },
  { key: "defence", label: "Mudofaa", sum: "defense_sum", accept: "defence_accept", sent: "sent_defence" },
  { key: "eco", label: "Ekologiya", sum: "eco_sum", accept: "eco_accept", sent: "sent_eco" },
  { key: "medicine", label: "Tibbiyot", sum: "medicine_sum", accept: "medicine_accept", sent: "sent_medicine" },
  { key: "penya", label: "Penya", sum: "penya_sum", accept: "penya_accept", sent: "sent_penya" },
  { key: "jarima", label: "Jarima", sum: "jarima_sum", accept: "jarima_accept", sent: "sent_jarima" },
  { key: "mail", label: "Pochta", sum: "mail_sum", accept: "mail_accept", sent: "sent_mail" },
];

const BY_KEY = new Map(CHANNELS.map((c) => [c.key, c]));

/** URL'dagi kalit → kanal. Noma'lum kalit — `undefined` (SQL'ga hech narsa tushmaydi). */
export function channelByKey(key: string | undefined | null): Channel | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/**
 * Ulush HOLATLARI. Birinchi to'rttasi (`otkazilgan` / `otkazilmagan` /
 * `tasdiqlanmagan`) bitta kanal ichida qatorlarni TO'LIQ va kesishmasdan bo'ladi:
 * jami = o'tkazilgan + o'tkazilmagan + tasdiqlanmagan.
 *
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
  { key: "otkazilgan", label: "O'tkazilgan" },
  { key: "tasdiqlanmagan", label: "Tasdiqlanmagan" },
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
