"use client";

import { useActionState } from "react";
import { createUserAction, resetPasswordAction, updateUserAction, type ActionState } from "./actions";

export interface UserView {
  id: string;
  username: string;
  fullName: string;
  role: "SUPER_ADMIN" | "ADMIN";
  isActive: boolean;
  /** Serverda formatlangan satr (gidratsiya uchun). */
  lastLogin: string;
  isSelf: boolean;
}

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

export function CreateUserForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, null);
  return (
    <form action={action} className="space-y-2 p-4">
      <div className="grid gap-2 md:grid-cols-[1fr_1.5fr_1fr_auto_auto]">
        <input name="username" required placeholder="Login" autoComplete="off" className={inputCls} />
        <input name="fullName" required placeholder="F.I.Sh." className={inputCls} />
        <input name="password" type="password" required minLength={10} placeholder="Parol (≥10)" autoComplete="new-password" className={inputCls} />
        <select name="role" defaultValue="ADMIN" className={inputCls}>
          <option value="ADMIN">Administrator</option>
          <option value="SUPER_ADMIN">Super admin</option>
        </select>
        <button type="submit" disabled={pending} className={btnCls} style={{ background: "var(--cobalt)" }}>
          Qo&apos;shish
        </button>
      </div>
      <Msg s={state} />
    </form>
  );
}

export function UserRow({ u }: { u: UserView }) {
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
          <select name="role" defaultValue={u.role} className={`${inputCls} py-1.5`}>
            <option value="ADMIN">Administrator</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </select>
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
