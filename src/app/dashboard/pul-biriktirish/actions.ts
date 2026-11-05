"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { href } from "@/lib/filters";
import { PAYMENTS_CACHE_TAG } from "@/server/services/payments";
import { clearUnpaidCache } from "@/server/services/unpaidItems";
import { cancelAttachment, detachOpenChannels } from "@/server/services/pulBiriktirish";

export async function cancelAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();

  const res = await cancelAttachment(id);
  if (res.ok) {
    revalidateTag(PAYMENTS_CACHE_TAG);
    clearUnpaidCache();
    await audit(user.id, "CANCEL_ATTACHMENT", { qism: id, payments: res.payments.paymentsId, ustun: res.payments.ustun, kamaydi: res.payments.kamaydi });
  } else {
    await audit(user.id, "CANCEL_ATTACHMENT_FAILED", { qism: id, sabab: res.sabab });
  }
  redirect(href("/dashboard/pul-biriktirish", { id, natija: res.ok ? "ok" : "xato", sabab: res.ok ? undefined : res.sabab }));
}

export async function detachChannelsAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();

  const res = await detachOpenChannels(id);
  if (res.ok) {
    revalidateTag(PAYMENTS_CACHE_TAG);
    clearUnpaidCache();
    await audit(user.id, "DETACH_CHANNELS", {
      qism: id,
      kanallar: res.ajratildi.map((k) => `${k.label}: ${k.sum}`).join("; "),
      asumOldin: res.asumOldin,
      asumKeyin: res.asumKeyin,
      payments: res.payments.paymentsId,
      ustun: res.payments.ustun,
      kamaydi: res.payments.kamaydi,
    });
  } else {
    await audit(user.id, "DETACH_CHANNELS_FAILED", { qism: id, sabab: res.sabab });
  }
  redirect(href("/dashboard/pul-biriktirish", { id, natija: res.ok ? "ajratildi" : "xato", sabab: res.ok ? undefined : res.sabab }));
}
