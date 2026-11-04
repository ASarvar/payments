"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { signOut } from "@/auth";
import { withBase } from "@/lib/basePath";
import { requireAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";
import { clearUnpaidCache } from "@/server/services/unpaidItems";

export async function signOutAction() {
  await signOut({ redirectTo: withBase("/login") });
}

export async function refreshDataAction() {
  const user = await requireAdmin();
  revalidateTag(PAYMENTS_CACHE_TAG);
  clearUnpaidCache();
  revalidatePath("/dashboard", "layout");
  await audit(user.id, "REFRESH_CACHE");
}
