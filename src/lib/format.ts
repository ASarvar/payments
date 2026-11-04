export function nf(n: number, digits = 0): string {
  return n.toLocaleString("uz-UZ", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function sum(n: number): string {
  return nf(Math.round(n));
}

export function mln(n: number): string {
  const v = Math.round(n / 1e5) / 10;
  return nf(v === 0 ? 0 : v, 1);
}

export function money(n: number): { value: string; unit: string } {
  const a = Math.abs(n);
  if (a >= 1e12) return { value: nf(n / 1e12, 2), unit: "trln so'm" };
  if (a >= 1e9) return { value: nf(n / 1e9, 2), unit: "mlrd so'm" };
  if (a >= 1e6) return { value: nf(n / 1e6, 1), unit: "mln so'm" };
  return { value: nf(n), unit: "so'm" };
}

export function pct1(n: number, d: number): string {
  return d > 0 ? `${nf((n / d) * 100, 1)}%` : "—";
}

export function dmy(s: string | null | undefined, withTime = false): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return s;
  const d = `${m[3]}.${m[2]}.${m[1]}`;
  return withTime && m[4] ? `${d} ${m[4]}:${m[5]}` : d;
}

export function nowTashkent(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tashkent" });
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayTashkent(): string {
  return nowTashkent().slice(0, 10);
}
