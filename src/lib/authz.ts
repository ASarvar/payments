import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ACCESS, PAGE_KEYS, homeOf, type EditableRole, type PageKey } from "@/lib/pages";
import type { PaymentFilters } from "@/server/services/payments";

export { ROLE_LABEL } from "@/lib/roles";

export type SessionUser = {
  id: string;
  role: Role;
  username: string;
  name: string;
  regionId: number | null;
};

export const isModerator = (u: Pick<SessionUser, "role">): boolean =>
  u.role === "MODERATOR" || u.role === "REPUBLIC_MODERATOR";

export const isRegionModerator = (u: Pick<SessionUser, "role">): boolean => u.role === "MODERATOR";

const loadUser = cache(async (id: string) =>
  prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, username: true, fullName: true, isActive: true, sessionVersion: true, regionId: true },
  }),
);

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const db = await loadUser(id);
  if (!db || !db.isActive) return null;
  if (session.user.sessionVersion !== db.sessionVersion) return null;

  return { id: db.id, role: db.role, username: db.username, name: db.fullName, regionId: db.regionId };
}

export const SESSION_EXPIRED_PATH = "/session-expired";

export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Avtorizatsiya talab qilinadi");
  return user;
}

export async function loadRoleAccess(role: EditableRole): Promise<Set<PageKey>> {
  const rows = await prisma.rolePageAccess.findMany({ where: { role }, select: { page: true, allowed: true } });
  const saved = new Map(rows.map((r) => [r.page, r.allowed]));
  return new Set(PAGE_KEYS.filter((k) => saved.get(k) ?? DEFAULT_ACCESS[role].includes(k)));
}

const accessOf = cache(
  async (role: Role): Promise<Set<PageKey>> => (role === "SUPER_ADMIN" ? new Set(PAGE_KEYS) : loadRoleAccess(role)),
);

export const getAllowedPages = (u: Pick<SessionUser, "role">): Promise<Set<PageKey>> => accessOf(u.role);

export async function homePath(u: Pick<SessionUser, "role">): Promise<string | null> {
  return homeOf(await getAllowedPages(u));
}

export async function requirePage(key: PageKey): Promise<SessionUser> {
  const user = await requireUserOrRedirect();
  const allowed = await getAllowedPages(user);
  if (allowed.has(key)) return user;
  const home = homeOf(allowed);
  if (home) redirect(home);
  notFound();
}

export async function requirePageAction(key: PageKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await getAllowedPages(user)).has(key)) throw new Error("Ruxsat yo'q");
  return user;
}

export async function requirePageApi(key: PageKey): Promise<SessionUser | Response> {
  const user = await getCurrentUser();
  if (!user) return plain("Avtorizatsiya talab qilinadi", 401);
  if (!(await getAllowedPages(user)).has(key)) return plain("Ruxsat yo'q", 403);
  return user;
}

function plain(msg: string, status: number): Response {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") throw new Error("Ruxsat yo'q");
  return user;
}

export async function requireSuperAdminPage(): Promise<SessionUser> {
  const user = await requireUserOrRedirect();
  if (user.role !== "SUPER_ADMIN") notFound();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (isModerator(user)) throw new Error("Ruxsat yo'q");
  return user;
}

export function scopeFilters(user: SessionUser, f: PaymentFilters): PaymentFilters | null {
  if (!isRegionModerator(user)) return f;
  if (user.regionId === null) return null;
  return { ...f, obl: user.regionId, area: f.obl === user.regionId ? f.area : undefined };
}
