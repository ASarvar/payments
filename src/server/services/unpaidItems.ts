import { Prisma } from "@prisma/client";
import type { Channel } from "@/lib/channels";
import { readOnly } from "@/lib/projectDb";
import { ITEMS_PARSED, PAID, PAID_CACHE_SECONDS } from "@/server/services/uzasboSql";

interface Entry {
  at: number;
  set: Set<string>;
}

const g = globalThis as unknown as { unpaidItems?: Map<string, Entry>; unpaidPending?: Map<string, Promise<Set<string>>> };
const cache = (g.unpaidItems ??= new Map<string, Entry>());
const pending = (g.unpaidPending ??= new Map<string, Promise<Set<string>>>());

function load(ch: Channel): Promise<Set<string>> {
  const running = pending.get(ch.key);
  if (running) return running;
  const job = (async () => {
    const t0 = Date.now();
    const S = Prisma.raw(`pi.${ch.sum}`);
    const T = Prisma.raw(`pi.${ch.sent}`);
    const rows = await readOnly((tx) =>
      tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        WITH paid AS (
          SELECT DISTINCT e::bigint AS item
          FROM uzasbo_send u CROSS JOIN LATERAL unnest(${ITEMS_PARSED}) AS e
          WHERE ${PAID} AND u.receiver_type = ${ch.rt}::int AND e ~ '^[0-9]{1,18}$'
        )
        SELECT pi.id::text AS id
        FROM payment_items pi
        LEFT JOIN paid pd ON pd.item = pi.id
        WHERE pi.state = 1 AND ${S} > 0 AND ${T} IS TRUE AND pd.item IS NULL`),
    );
    const set = new Set(rows.map((r) => r.id));
    cache.set(ch.key, { at: Date.now(), set });
    console.log(`[to'lanmagan] ${ch.key}: ${set.size} qism, ${Date.now() - t0} ms`);
    return set;
  })().finally(() => pending.delete(ch.key));
  pending.set(ch.key, job);
  return job;
}

export async function getUnpaidSent(ch: Channel): Promise<Set<string>> {
  const hit = cache.get(ch.key);
  if (hit) {
    if (Date.now() - hit.at >= PAID_CACHE_SECONDS * 1000) load(ch).catch((e) => console.error("[to'lanmagan] fonda yangilash:", e));
    return hit.set;
  }
  return load(ch);
}

export function clearUnpaidCache(): void {
  cache.clear();
}
