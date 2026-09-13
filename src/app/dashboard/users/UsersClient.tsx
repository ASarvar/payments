"use client";

import { useActionState, useState } from "react";
import { createUserAction, resetPasswordAction, updateUserAction, type ActionState } from "./actions";

export type RoleKey = "SUPER_ADMIN" | "ADMIN" | "MODERATOR";

export interface RegionOpt {
  id: number;
  name: string;
}

export interface UserView {
  id: string;
  username: string;
  fullName: string;
  role: RoleKey;
  /** Faqat moderator uchun. */
  regionId: number | null;
  isActive: boolean;
  /** Serverda formatlangan satr (gidratsiya uchun). */
  lastLogin: string;
  isSelf: boolean;
}

const ROLE_OPTIONS: { value: RoleKey; label: string }[] = [
  { value: "ADMIN", label: "Administrator" },
  { value: "MODERATOR", label: "Hudud moderatori" },
  { value: "SUPER_ADMIN", label: "Super admin" },
];

const inputCls =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/20";
const btnCls = "rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50";

function Msg({ s }: { s: ActionState }) {
  if (!s) return null;
  return s.error ? (
    <p className="text-[12px] text-red-700">{s.error}</p>
  ) : s.ok ? (
    <p className="text-[12px] text-emerald-700">{s.ok}</p>
  ) : null;
}

/** Rol va — faqat "Hudud moderatori" tanlanganda — hudud. Hududni server ham tekshiradi. */
function RoleFields({
  role,
  regionId,
  regions,
  compact,
}: {
  role: RoleKey;
  regionId: number | null;
  regions: RegionOpt[];
  compact?: boolean;
}) {
  const [r, setR] = useState<RoleKey>(role);
  const cls = compact ? `${inputCls} py-1.5` : inputCls;
  return (
    <>
      <select name="role" value={r} onChange={(e) => setR(e.target.value as RoleKey)} className={cls}>
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {r === "MODERATOR" ? (
        <select name="regionId" required defaultValue={regionId ?? ""} className={`${cls} max-w-[200px]`}>
          <option value="" disabled>
            Hududni tanlang
          </option>
          {regions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}

export function CreateUserForm({ regions }: { regions: RegionOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, null);
  return (
    <form action={action} className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input name="username" required placeholder="Login" autoComplete="off" className={`${inputCls} w-40`} />
        <input name="fullName" required placeholder="F.I.Sh." className={`${inputCls} min-w-[220px] flex-1`} />
        <input
          name="password"
          type="password"
          required
          minLength={10}
          placeholder="Parol (≥10)"
          autoComplete="new-password"
          className={`${inputCls} w-40`}
        />
        <RoleFields role="ADMIN" regionId={null} regions={regions} />
        <button type="submit" disabled={pending} className={btnCls} style={{ background: "var(--cobalt)" }}>
          Qo&apos;shish
        </button>
      </div>
      <Msg s={state} />
    </form>
  );
}

export function UserRow({ u, regions }: { u: UserView; regions: RegionOpt[] }) {
  const [upd, updAction, updPending] = useActionState<ActionState, FormData>(updateUserAction, null);
  const [pw, pwAction, pwPending] = useActionState<ActionState, FormData>(resetPasswordAction, null);
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-3 py-2.5 text-[13px]">
        <div className="font-medium text-slate-800">{u.username}</div>
        <div className="text-[12px] text-muted-foreground">{u.fullName}</div>
      </td>
      <td className="px-3 py-2.5">
        <form action={updAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={u.id} />
          <RoleFields role={u.role} regionId={u.regionId} regions={regions} compact />
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <input type="checkbox" name="isActive" defaultChecked={u.isActive} /> Faol
          </label>
          <button type="submit" disabled={updPending} className={`${btnCls} py-1.5`} style={{ background: "var(--navy)" }}>
            Saqlash
          </button>
        </form>
        <Msg s={upd} />
        {u.isSelf ? <p className="mt-1 text-[11px] text-muted-foreground">bu — siz</p> : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums text-slate-600">{u.lastLogin}</td>
      <td className="px-3 py-2.5">
        <form action={pwAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={u.id} />
          <input
            name="password"
            type="password"
            required
            minLength={10}
            placeholder="Yangi parol"
            autoComplete="new-password"
            className={`${inputCls} w-40 py-1.5`}
          />
          <button type="submit" disabled={pwPending} className={`${btnCls} py-1.5`} style={{ background: "var(--cobalt)" }}>
            Tiklash
          </button>
        </form>
        <Msg s={pw} />
      </td>
    </tr>
  );
}
