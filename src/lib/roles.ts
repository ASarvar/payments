import type { Role } from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrator",
  MODERATOR: "Hudud moderatori",
  REPUBLIC_MODERATOR: "Respublika moderatori",
};

export const ROLE_ORDER = ["ADMIN", "MODERATOR", "REPUBLIC_MODERATOR", "SUPER_ADMIN"] as const satisfies readonly Role[];
