import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Banknote, LogIn } from "lucide-react";
import { withBase } from "@/lib/basePath";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; expired?: string }>;
}) {
  const { error, expired } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        // Auth.js core `redirectTo` ni mutlaq URL qiladi — basePath'ni qo'lda qo'shamiz.
        redirectTo: withBase("/dashboard"),
      });
    } catch (err) {
      // Login xatosi => login sahifasiga qaytamiz. Redirect (muvaffaqiyat) uzatiladi.
      if (err instanceof AuthError) redirect("/login?error=1");
      throw err;
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 60%, var(--cobalt) 100%)" }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl shadow-lg"
            style={{ background: "var(--gold)" }}
          >
            <Banknote className="h-6 w-6" style={{ color: "var(--navy)" }} />
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>
            To&apos;lovlar monitoringi
          </h1>
          <p className="mt-1 text-sm text-slate-500">Tizimga kirish</p>
        </div>

        {error ? (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Login yoki parol noto&apos;g&apos;ri (ko&apos;p xato urinishdan keyin login 15 daqiqaga bloklanadi)
          </p>
        ) : null}

        {expired && !error ? (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sessiya muddati tugadi yoki parol o&apos;zgartirildi — qayta kiring.
          </p>
        ) : null}

        <form action={authenticate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Login</label>
            <input
              name="username"
              type="text"
              required
              autoComplete="username"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Parol</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/30"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
            style={{ background: "var(--navy)" }}
          >
            <LogIn className="h-4 w-4" />
            Kirish
          </button>
        </form>
      </div>
    </main>
  );
}
