import { z } from "zod";

/**
 * `project` bazasi ulanishi obyektlar ilovasidagi kabi alohida kalitlar bilan
 * ham berilishi mumkin (`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`) —
 * shunda serverdagi mavjud blokni o'zgartirmasdan nusxalash mumkin.
 * `PROJECT_DATABASE_URL` to'g'ridan-to'g'ri berilgan bo'lsa — O'SHA ustun.
 *
 * ⚠️ Login/parol `encodeURIComponent` bilan qochiriladi: parolda `@` yoki `/`
 * bo'lsa satr jimgina noto'g'ri xostga ulanardi.
 */
if (!process.env.PROJECT_DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME) {
  const user = encodeURIComponent(process.env.DB_USER ?? "");
  const pass = encodeURIComponent(process.env.DB_PASSWORD ?? "");
  const auth = user ? `${user}${pass ? `:${pass}` : ""}@` : "";
  const port = process.env.DB_PORT || "5432";
  process.env.PROJECT_DATABASE_URL = `postgresql://${auth}${process.env.DB_HOST}:${port}/${process.env.DB_NAME}`;
}

// Server-side env validatsiyasi. Yaroqsiz konfiguratsiyada ilova ishga tushmaydi.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),

  /** `project` bazasi. Sozlanmagan bo'lsa sahifalar ogohlantirish ko'rsatadi. */
  PROJECT_DATABASE_URL: z.string().url().optional(),
  /**
   * Bitta so'rovning eng ko'p vaqti — Postgres'ning `statement_timeout` i.
   * ⚠️ `project` — boshqa tizimning JONLI bazasi: bizning og'ir so'rovimiz uni
   * sekinlashtirmasligi uchun chegara shart.
   */
  PROJECT_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(60_000),
  /** Umumiy ko'rsatkichlar keshi, soniya. */
  CACHE_SECONDS: z.coerce.number().int().positive().default(300),
  /** Excel eksportining eng katta hajmi (qator) — undan ko'p bo'lsa filtr so'raladi. */
  EXPORT_MAX_ROWS: z.coerce.number().int().positive().default(300_000),
});

export const env = schema.parse(process.env);
