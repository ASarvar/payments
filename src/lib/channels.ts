export interface Channel {
  key: string;
  label: string;
  sum: string;
  accept: string;
  sent: string;
  rt: number;
}

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

export function channelByKey(key: string | undefined | null): Channel | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export function channelByRt(rt: number): Channel | undefined {
  return BY_RT.get(rt);
}

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
