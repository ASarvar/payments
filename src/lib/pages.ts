import type { Role } from "@prisma/client";

export const PAGE_KEYS = ["dashboard", "kanal", "yonalishlar", "royxat", "taqsimot", "shartnomalar", "pul-biriktirish"] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

export interface PageDef {
  key: PageKey;
  label: string;
  href: string;
  match: string;
  exact?: boolean;
}

export const PAGES: PageDef[] = [
  { key: "dashboard", label: "Nazorat paneli", href: "/dashboard", match: "/dashboard", exact: true },
  { key: "kanal", label: "Kanallar", href: "/dashboard/kanal/vat", match: "/dashboard/kanal" },
  { key: "yonalishlar", label: "Yo'nalishlar", href: "/dashboard/yonalishlar", match: "/dashboard/yonalishlar" },
  { key: "royxat", label: "To'lovlar ro'yxati", href: "/dashboard/royxat", match: "/dashboard/royxat" },
  { key: "taqsimot", label: "Taqsimot", href: "/dashboard/taqsimot", match: "/dashboard/taqsimot" },
  { key: "shartnomalar", label: "Shartnomalar", href: "/dashboard/shartnomalar", match: "/dashboard/shartnomalar" },
  { key: "pul-biriktirish", label: "Pul biriktirish", href: "/dashboard/pul-biriktirish", match: "/dashboard/pul-biriktirish" },
];

export const EDITABLE_ROLES = ["ADMIN", "MODERATOR", "REPUBLIC_MODERATOR"] as const satisfies readonly Role[];

export type EditableRole = (typeof EDITABLE_ROLES)[number];

export const DEFAULT_ACCESS: Record<EditableRole, readonly PageKey[]> = {
  ADMIN: PAGE_KEYS,
  MODERATOR: ["royxat"],
  REPUBLIC_MODERATOR: ["royxat"],
};

export const isPageKey = (s: string): s is PageKey => (PAGE_KEYS as readonly string[]).includes(s);

export function homeOf(allowed: ReadonlySet<PageKey>): string | null {
  return PAGES.find((p) => allowed.has(p.key))?.href ?? null;
}
