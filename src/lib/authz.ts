import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PaymentFilters } from "@/server/services/payments";

export { ROLE_LABEL } from "@/lib/roles";

export type SessionUser = {
  id: string;
  role: Role;
  username: string;
  name: string;
  regionId: number | null;
};

export const MODERATOR_HOME = "/dashboard/royxat";

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

export async function requireUserOrRedirect(opts: { moderator?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);
  if (isModerator(user) && !opts.moderator) redirect(MODERATOR_HOME);
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Avtorizatsiya talab qilinadi");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") throw new Error("Ruxsat yo'q");
  return user;
}

export async function requireSuperAdminPage(): Promise<SessionUser> {
  const user = await requireUserOrRedirect({ moderator: true });
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
