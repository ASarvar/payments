import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { CHANNELS } from "@/lib/channels";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";

export const SINGLE_ITEM_RT = 4;

export const ITEM_SHARES = Prisma.raw(
  CHANNELS.map((c) => `pi.${c.sum} AS "${c.key}_s", pi.${c.accept} AS "${c.key}_a", pi.${c.sent} AS "${c.key}_t"`).join(", "),
);

export const cacheOpts = () => ({ revalidate: env.CACHE_SECONDS, tags: [PAYMENTS_CACHE_TAG] });
export const whereSql = (conds: Prisma.Sql[]) => Prisma.join(conds, " AND ");
export const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
export const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
