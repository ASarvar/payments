"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { signOut } from "@/auth";
import { withBase } from "@/lib/basePath";
import { requireAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";

export async function signOutAction() {
  // Auth.js core `redirectTo` ni mutlaq URL qiladi — basePath'ni qo'lda qo'shamiz.
  await signOut({ redirectTo: withBase("/login") });
}

/** Keshni tashlab, ko'rsatkichlarni bazadan qayta hisoblatadi. */
export async function refreshDataAction() {
  const user = await requireAdmin();
  revalidateTag(PAYMENTS_CACHE_TAG);
  revalidatePath("/dashboard", "layout");
  await audit(user.id, "REFRESH_CACHE");
}
