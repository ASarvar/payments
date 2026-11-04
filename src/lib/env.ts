import { z } from "zod";

if (!process.env.PROJECT_DATABASE_URL && process.env.DB_HOST && process.env.DB_NAME) {
  const user = encodeURIComponent(process.env.DB_USER ?? "");
  const pass = encodeURIComponent(process.env.DB_PASSWORD ?? "");
  const auth = user ? `${user}${pass ? `:${pass}` : ""}@` : "";
  const port = process.env.DB_PORT || "5432";
  process.env.PROJECT_DATABASE_URL = `postgresql://${auth}${process.env.DB_HOST}:${port}/${process.env.DB_NAME}`;
}

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),

  PROJECT_DATABASE_URL: z.string().url().optional(),
  PROJECT_WRITE_DATABASE_URL: z.string().url().optional(),
  PROJECT_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(60_000),
  CACHE_SECONDS: z.coerce.number().int().positive().default(300),
  EXPORT_MAX_ROWS: z.coerce.number().int().positive().default(300_000),
  WARM_TOKEN: z.string().min(24).optional(),
});

export const env = schema.parse(process.env);
