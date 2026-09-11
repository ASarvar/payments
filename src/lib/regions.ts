/**
 * Hududlar — `project.lists` (`type_id = 1`) identifikatorlari.
 *
 * ⚠️ Id'lar SOATO tartibida (3 Andijon … 35 Qoraqalpog'iston), rasmiy hisobot
 * tartibi esa boshqacha. Jadvallar shu ro'yxat bo'yicha tartiblanadi; ro'yxatda
 * yo'q yangi id paydo bo'lsa — oxiriga qo'shiladi (yo'qolmaydi).
 * `0` — "Respublika" (markaziy), oxirida.
 */
export const REGION_ORDER: readonly number[] = [35, 3, 6, 8, 10, 12, 14, 18, 22, 24, 27, 30, 33, 26, 0];

export function regionRank(id: number | null): number {
  if (id === null) return 10_000;
  const i = REGION_ORDER.indexOf(id);
  return i === -1 ? 1_000 + id : i;
}
