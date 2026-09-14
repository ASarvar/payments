import type { Role } from "@prisma/client";

/**
 * Rollar — yorliq va tanlovdagi tartib uchun YAGONA joy. Server (`lib/authz.ts`,
 * foydalanuvchi amallari) ham, client (`UsersClient`) ham shu yerdan oladi.
 * ⚠️ Prisma'dan faqat `import type` — client bundle'ga Prisma tushmasin.
 */
export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrator",
  MODERATOR: "Hudud moderatori",
  REPUBLIC_MODERATOR: "Respublika moderatori",
};

/** Tanlovdagi tartib (birinchisi — yangi foydalanuvchi uchun standart). */
export const ROLE_ORDER = ["ADMIN", "MODERATOR", "REPUBLIC_MODERATOR", "SUPER_ADMIN"] as const satisfies readonly Role[];
