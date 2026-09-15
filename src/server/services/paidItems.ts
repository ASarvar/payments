import { Prisma } from "@prisma/client";
import { readOnly } from "@/lib/projectDb";
import { ITEMS_PARSED, PAID, PAID_CACHE_SECONDS } from "@/server/services/uzasboSql";

/**
 * Kanal (`rt`) bo'yicha g'aznachilik TO'LAGAN qismlar to'plami — ro'yxat sahifasi va eksport uchun
 * (qator holati, "to'langan"/"topshiriqnomada" filtri). XOTIRADA keshlanadi (`PAID_CACHE_SECONDS`).
 *
 * ⚠️ Nega qatorga GIN tekshiruvi (`@> ARRAY[pi.id]`) EMAS: serverda (2026-09-15) Postgres unga GIN'ni
 * tanlamadi — qiymat so'rov paytida ma'lum bo'lmagani uchun `recreated` indeksi bo'ylab 198 ming
 * qatorni ko'rdi, bitta qatorga 1,6 s (sahifada 50 qator — 80 s).
 * ⚠️ `unstable_cache` EMAS: QQS'da ~180 ming id — Next'ning 2 MB kesh chegarasidan oshadi.
 * Eskirgan to'plam darhol qaytariladi, yangisi fonda olinadi; "Yangilash" — `clearPaidItemCache()`.
 */

interface Entry {
  at: number;
  set: Set<string>;
}

const g = globalThis as unknown as { paidItems?: Map<number, Entry>; paidItemsPending?: Map<number, Promise<Set<string>>> };
const cache = (g.paidItems ??= new Map<number, Entry>());
const pending = (g.paidItemsPending ??= new Map<number, Promise<Set<string>>>());

function load(rt: number): Promise<Set<string>> {
  const running = pending.get(rt);
  if (running) return running;
  const job = (async () => {
    const t0 = Date.now();
    // `e::bigint::text` — `String(pi.id)` bilan aynan solishtirish uchun (oldidagi nollarsiz).
    const rows = await readOnly((tx) =>
      tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT DISTINCT e::bigint::text AS id
        FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_PARSED}) AS e
        WHERE ${PAID} AND u.receiver_type = ${rt}::int AND e ~ '^[0-9]{1,18}$'`),
    );
    const set = new Set(rows.map((r) => r.id));
    cache.set(rt, { at: Date.now(), set });
    console.log(`[to'langan] tur ${rt}: ${set.size} qism, ${Date.now() - t0} ms`);
    return set;
  })().finally(() => pending.delete(rt));
  pending.set(rt, job);
  return job;
}

export async function getPaidItemSet(rt: number): Promise<Set<string>> {
  const hit = cache.get(rt);
  if (hit) {
    if (Date.now() - hit.at >= PAID_CACHE_SECONDS * 1000) load(rt).catch((e) => console.error("[to'langan] fonda yangilash:", e));
    return hit.set;
  }
  return load(rt);
}

export function clearPaidItemCache(): void {
  cache.clear();
}
