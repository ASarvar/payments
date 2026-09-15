import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Audit yozuvi. ⚠️ Xatosi asosiy amalni TO'XTATMAYDI (logga yoziladi) — audit
 * bazasi vaqtincha yetib bo'lmasa, foydalanuvchi baribir ishlay olsin.
 * ⚠️ `details` ga parol, to'liq hisob raqami kabi sirlarni yozmang.
 */
export async function audit(userId: string | null, action: string, details?: Prisma.InputJsonValue): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { userId, action, details } });
  } catch (e) {
    console.error(`[audit] ${action} yozilmadi:`, e instanceof Error ? e.message : e);
  }
}

export const AUDIT_LABEL: Record<string, string> = {
  LOGIN: "Tizimga kirdi",
  LOGIN_FAILED: "Kirish xatosi",
  LOGIN_BLOCKED: "Kirish bloklandi (ko'p urinish)",
  EXPORT: "Excel eksport",
  EXPORT_TAQSIMOT: "Taqsimot Excel",
  REFRESH_CACHE: "Ma'lumotni yangiladi",
  CREATE_USER: "Foydalanuvchi qo'shdi",
  RESET_PASSWORD: "Parolni tikladi",
  UPDATE_USER: "Foydalanuvchini o'zgartirdi",
};
