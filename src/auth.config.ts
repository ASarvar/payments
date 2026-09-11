import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

// Edge-safe konfiguratsiya (Prisma/bcrypt YO'Q) — middleware shuni ishlatadi.
// Credentials provider (DB kerak) auth.ts'da qo'shiladi.

/**
 * Faolsizlik muddati — 1 soat, SIRPANUVCHI: middleware har so'rovda JWT'ni
 * `now + maxAge` bilan qayta imzolaydi. Ya'ni "oxirgi harakatdan 1 soat".
 * ⚠️ Env orqali EMAS: edge middleware env'ni BUILD vaqtida inline qiladi.
 */
export const SESSION_IDLE_SECONDS = 60 * 60;

export const authConfig: NextAuthConfig = {
  // Reverse-proxy ortida host'ga ishonamiz (on-premise).
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS },
  pages: { signIn: "/login" },
  /**
   * ⚠️ Cookie nomlari HAR DOIM o'zimizniki — dev'da ham. davijara.uz da (va dev'da
   * localhost'da) boshqa Auth.js ilovalar ham bor: obyektlar monitoringi va ildizdagi
   * sayt. Cookie'lar PORTGA bog'lanmaydi, ya'ni standart `authjs.session-token`
   * bo'lsa bir ilovaga kirish ikkinchisidan chiqarib yuborardi.
   * `__Secure-` prefiksisiz: edge bundle NEXTAUTH_URL'ni build'da ko'rmaydi;
   * `Secure`/`HttpOnly` baribir runtime'da (HTTPS'da) qo'yiladi.
   */
  cookies: {
    sessionToken: { name: "payments.session-token" },
    callbackUrl: { name: "payments.callback-url" },
    csrfToken: { name: "payments.csrf-token" },
  },
  providers: [], // auth.ts'da to'ldiriladi
  callbacks: {
    // ⚠️ `authorized` YO'Q — himoya va basePath'li login redirect `middleware.ts` da.
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.username = (user as { username: string }).username;
        token.sessionVersion = (user as { sessionVersion: number }).sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // ⚠️ `as` SHART: `next build` tipni tekshirganda token maydonlari `unknown`
        // (obyektlar 1.14.0 Docker build'i aynan shunda yiqilgan).
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.username = (token.username as string) ?? "";
        session.user.sessionVersion = token.sessionVersion as number | undefined;
      }
      return session;
    },
  },
};
