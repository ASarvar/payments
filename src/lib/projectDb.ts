import { PrismaClient, type Prisma } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * `project` bazasi — to'lovlar shu yerda (`payment_items`, `lists`, `vw_all_contracts`).
 *
 * ⚠️ BU BOSHQA TIZIMNING JONLI BAZASI. Jadvalda audit triggeri bor va ilova
 * ishlatadigan rol (`project`) YOZA OLADI. Shuning uchun har bir so'rov
 * `readOnly()` orqali o'tadi: tranzaksiya `READ ONLY` qilinadi — kodda xato
 * bo'lsa ham Postgres o'zi yozishni rad etadi. Bu kod intizomiga emas, baza
 * darajasidagi kafolatga tayanadi.
 *
 * ⚠️ `statement_timeout` ham shu yerda: bizning og'ir hisobotimiz o'sha tizimni
 * sekinlashtirib qo'ymasin.
 *
 * ⚠️ Ikkinchi `PrismaClient` (`pg` emas) — faqat xom SQL uchun; generatsiya
 * qilingan modellar (User, AuditLog) bu bazada ishlatilmaydi.
 */
const globalForProjectDb = globalThis as unknown as { projectDb?: PrismaClient };

export function projectConfigured(): boolean {
  return Boolean(env.PROJECT_DATABASE_URL);
}

function client(): PrismaClient {
  const url = env.PROJECT_DATABASE_URL;
  if (!url) throw new Error("PROJECT_DATABASE_URL sozlanmagan");
  if (!globalForProjectDb.projectDb) {
    globalForProjectDb.projectDb = new PrismaClient({
      datasourceUrl: url,
      // ⚠️ `query` log YO'Q: parametrlarda hisob raqami/STIR bo'lishi mumkin.
      log: ["error"],
    });
  }
  return globalForProjectDb.projectDb;
}

/** Faqat o'qish tranzaksiyasi ichida bajaradi. Yozishga urinish Postgres xatosi beradi. */
export async function readOnly<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const timeout = Math.trunc(env.PROJECT_QUERY_TIMEOUT_MS);
  return client().$transaction(
    async (tx) => {
      // ⚠️ Tranzaksiyadagi BIRINCHI buyruq bo'lishi shart — undan keyin o'rnatib bo'lmaydi.
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${timeout}`);
      return fn(tx);
    },
    { maxWait: 10_000, timeout: timeout + 5_000 },
  );
}

/** Foydalanuvchiga ko'rsatiladigan xato matni (ichki tafsilotlarsiz). */
export function projectErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("statement timeout")) {
    return "So'rov juda uzoq davom etdi va to'xtatildi — sana oralig'ini yoki hududni toraytiring.";
  }
  if (msg.includes("PROJECT_DATABASE_URL")) return "To'lovlar bazasiga ulanish sozlanmagan (PROJECT_DATABASE_URL).";
  if (msg.includes("Can't reach database") || msg.includes("ECONNREFUSED")) {
    return "To'lovlar bazasiga ulanib bo'lmadi.";
  }
  return "To'lovlar bazasidan ma'lumot olishda xato.";
}
