export const REGION_ORDER: readonly number[] = [35, 3, 6, 8, 10, 12, 14, 18, 22, 24, 27, 30, 33, 26, 0];

export function regionRank(id: number | null): number {
  if (id === null) return 10_000;
  const i = REGION_ORDER.indexOf(id);
  return i === -1 ? 1_000 + id : i;
}
