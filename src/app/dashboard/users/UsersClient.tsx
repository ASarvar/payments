"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/roles";
import { createUserAction, resetPasswordAction, updateUserAction, type ActionState } from "./actions";

export interface RegionOpt {
  id: number;
  name: string;
}

export interface UserView {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  /** Faqat moderator uchun. */
  regionId: number | null;
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

/**
 * Rol va hudud. Ikkalasi ham NAZORATSIZ (`defaultValue`): forma amalidan keyin React ularni
 * boshlang'ich qiymatga qaytaradi — xato bo'lsa saqlanmagan rol ko'rinib qolmaydi.
 * Hudud tanlovi faqat "Hudud moderatori" tanlanganda ko'rinadi — JS holatisiz, CSS `:has()`
 * bilan (`globals.css` → `.role-fields`). Hududni server tekshiradi (majburiy).
 */
function RoleFields({
  role,
  regionId,
  regions,
  compact,
}: {
  role: Role;
  regionId: number | null;
  regions: RegionOpt[];
  compact?: boolean;
}) {
  const cls = compact ? `${inputCls} py-1.5` : inputCls;
  // `project` bazasi ishlamasa ro'yxat bo'sh — joriy hudud baribar tanlovda qolsin (saqlash buzilmasin).
  const missingId = regionId !== null && !regions.some((g) => g.id === regionId) ? regionId : null;
  return (
    <span className="role-fields contents">
      <select name="role" defaultValue={role} className={cls}>
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <select name="regionId" defaultValue={regionId ?? ""} className={`role-region ${cls} max-w-[200px]`}>
        <option value="">Hududni tanlang</option>
        {missingId !== null ? <option value={missingId}>#{missingId}</option> : null}
        {regions.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </span>
  );
}

export function CreateUserForm({ regions }: { regions: RegionOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, null);
  // Xato bo'lsa server kiritilgan qiymatlarni (parolsiz) qaytaradi; `key` maydonlarni shu
  // qiymatlar bilan qayta chizadi — React'ning forma tozalashi ularni o'chirib yubormaydi.
  const v = state?.values;
  return (
    <form action={action} className="space-y-2 p-4">
      <div key={v ? JSON.stringify(v) : "empty"} className="flex flex-wrap items-center gap-2">
        <input
          name="username"
          required
          defaultValue={v?.username}
          placeholder="Login"
          autoComplete="off"
          className={`${inputCls} w-40`}
        />
        <input
          name="fullName"
          required
          defaultValue={v?.fullName}
          placeholder="F.I.Sh."
          className={`${inputCls} min-w-[220px] flex-1`}
        />
        <input
          name="password"
          type="password"
          required
          minLength={10}
          placeholder="Parol (≥10)"
          autoComplete="new-password"
          className={`${inputCls} w-40`}
        />
        <RoleFields role={v?.role ?? "ADMIN"} regionId={v?.regionId ?? null} regions={regions} />
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
        {/* `key` — bazadagi qiymat o'zgarsa forma yangi boshlang'ich qiymatlar bilan qayta chiziladi. */}
        <form key={`${u.role}:${u.regionId}:${u.isActive}`} action={updAction} className="flex flex-wrap items-center gap-2">
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
