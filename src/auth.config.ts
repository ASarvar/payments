import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

export const SESSION_IDLE_SECONDS = 60 * 60;

export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: { name: "payments.session-token" },
    callbackUrl: { name: "payments.callback-url" },
    csrfToken: { name: "payments.csrf-token" },
  },
  providers: [],
  callbacks: {
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
        session.user.id = token.sub as string;
        session.user.role = token.role as Role;
        session.user.username = (token.username as string) ?? "";
        session.user.sessionVersion = token.sessionVersion as number | undefined;
      }
      return session;
    },
  },
};
