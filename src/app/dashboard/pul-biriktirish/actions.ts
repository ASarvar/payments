"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { href } from "@/lib/filters";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";
import { clearUnpaidCache } from "@/server/services/unpaidItems";
import { cancelAttachment } from "@/server/services/pulBiriktirish";

/**
 * Biriktirishni bekor qilish (`payment_items.state = 0`).
 * ⚠️ Moderatorlar uchun yopiq (`requireAdmin`) — menyuda yashirish himoya emas.
 * ⚠️ Har urinish AUDITGA yoziladi: muvaffaqiyatli ham, rad etilgani ham.
 * ⚠️ Keshlar tashlanadi — aks holda bekor qilingan qism hisobotlarda 30 daqiqagacha turib qolardi.
 */
export async function cancelAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();

  const res = await cancelAttachment(id);
  if (res.ok) {
    revalidateTag(PAYMENTS_CACHE_TAG);
    clearUnpaidCache();
    await audit(user.id, "CANCEL_ATTACHMENT", { qism: id });
  } else {
    await audit(user.id, "CANCEL_ATTACHMENT_FAILED", { qism: id, sabab: res.sabab });
  }
  // Natija URL orqali ko'rsatiladi — sahifa qayta o'qiydi va yangi holatni chizadi.
  redirect(href("/dashboard/pul-biriktirish", { id, natija: res.ok ? "ok" : "xato", sabab: res.ok ? undefined : res.sabab }));
}
