import { PrismaClient, type Prisma } from "@prisma/client";
import { env } from "@/lib/env";

const globalForProjectDb = globalThis as unknown as { projectDb?: PrismaClient; projectWriteDb?: PrismaClient };

export function projectConfigured(): boolean {
  return Boolean(env.PROJECT_DATABASE_URL);
}

function client(): PrismaClient {
  const url = env.PROJECT_DATABASE_URL;
  if (!url) throw new Error("PROJECT_DATABASE_URL sozlanmagan");
  if (!globalForProjectDb.projectDb) {
    globalForProjectDb.projectDb = new PrismaClient({
      datasourceUrl: url,
      log: ["error"],
    });
  }
  return globalForProjectDb.projectDb;
}

export async function readOnly<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const timeout = Math.trunc(env.PROJECT_QUERY_TIMEOUT_MS);
  return client().$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${timeout}`);
      return fn(tx);
    },
    { maxWait: 10_000, timeout: timeout + 5_000 },
  );
}

export function projectWriteConfigured(): boolean {
  return Boolean(env.PROJECT_WRITE_DATABASE_URL);
}

export async function writeTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const url = env.PROJECT_WRITE_DATABASE_URL;
  if (!url) throw new Error("PROJECT_WRITE_DATABASE_URL sozlanmagan");
  if (!globalForProjectDb.projectWriteDb) {
    globalForProjectDb.projectWriteDb = new PrismaClient({ datasourceUrl: url, log: ["error"] });
  }
  const timeout = Math.trunc(env.PROJECT_QUERY_TIMEOUT_MS);
  return globalForProjectDb.projectWriteDb.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${timeout}`);
      return fn(tx);
    },
    { maxWait: 10_000, timeout: timeout + 5_000 },
  );
}

export function projectErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("statement timeout")) {
    return "So'rov vaqti tugadi. Sana oralig'ini yoki hududni toraytiring.";
  }
  if (msg.includes("PROJECT_DATABASE_URL")) return "To'lovlar bazasiga ulanish sozlanmagan (PROJECT_DATABASE_URL).";
  if (msg.includes("Can't reach database") || msg.includes("ECONNREFUSED")) {
    return "To'lovlar bazasiga ulanib bo'lmadi.";
  }
  return "To'lovlar bazasidan ma'lumot olishda xato.";
}
