/**
 * Raqam va sana formatlash — YAGONA joy.
 *
 * ⚠️ Faqat SERVERDA chaqiring (Server Component yoki route). `toLocaleString("uz-UZ")`
 * Node'da `1 167`, brauzerda `1,167` beradi — client komponentda gidratsiya buziladi.
 * Client komponentga tayyor SATR uzating.
 */

/** Mingliklar ajratilgan son. */
export function nf(n: number, digits = 0): string {
  return n.toLocaleString("uz-UZ", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Pul summasi — so'mda, butun (jadvallar uchun). */
export function sum(n: number): string {
  return nf(Math.round(n));
}

/** Katta summa — qiymat va birlik ALOHIDA (KPI kartada turli o'lchamda chiziladi). */
export function money(n: number): { value: string; unit: string } {
  const a = Math.abs(n);
  if (a >= 1e12) return { value: nf(n / 1e12, 2), unit: "trln so'm" };
  if (a >= 1e9) return { value: nf(n / 1e9, 2), unit: "mlrd so'm" };
  if (a >= 1e6) return { value: nf(n / 1e6, 1), unit: "mln so'm" };
  return { value: nf(n), unit: "so'm" };
}

/** Ulush foizda, bir xonagacha. Maxraj 0 bo'lsa "—". */
export function pct1(n: number, d: number): string {
  return d > 0 ? `${nf((n / d) * 100, 1)}%` : "—";
}

/**
 * "YYYY-MM-DD[ HH:mm[:ss]]" → "dd.mm.yyyy[ HH:mm]" — SATR ustida, vaqt zonasiz.
 *
 * ⚠️ `project` bazasidagi vaqtlar `timestamp WITHOUT time zone` — ya'ni allaqachon
 * mahalliy (Toshkent) vaqt. Ularni `Date` + `timeZone` bilan formatlash yana +5 soat
 * qo'shib yuborardi. Shuning uchun xizmat ularni tayyor satr qilib beradi va bu yerda
 * faqat tartibi almashtiriladi.
 */
export function dmy(s: string | null | undefined, withTime = false): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return s;
  const d = `${m[3]}.${m[2]}.${m[1]}`;
  return withTime && m[4] ? `${d} ${m[4]}:${m[5]}` : d;
}

/** Hozirgi Toshkent vaqti "YYYY-MM-DD HH:mm:ss" (Excel'dagi JAMI qatori uchun). */
export function nowTashkent(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tashkent" });
}

/** Bugungi sana (Toshkent) "YYYY-MM-DD". */
export function todayTashkent(): string {
  return nowTashkent().slice(0, 10);
}
