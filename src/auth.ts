import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { authConfig } from "@/auth.config";

const credsSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

/**
 * Parol tanlashdan himoya: bitta login uchun 15 daqiqada 10 ta XATO urinish.
 * ⚠️ Faqat xatolar sanaladi (muvaffaqiyatli kirish hisobni tozalaydi).
 * ⚠️ Xotirada — bitta `web` jarayoni bor, qayta ishga tushsa nolga qaytadi (yetarli).
 */
const MAX_FAILS = 10;
const failures = new RateLimiterMemory({ points: MAX_FAILS, duration: 15 * 60 });

// Email YO'Q: login + parol. Ochiq ro'yxatdan o'tish YO'Q — foydalanuvchini super admin qo'shadi.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const username = parsed.data.username.toLowerCase().trim();

        const state = await failures.get(username);
        if (state && state.consumedPoints >= MAX_FAILS) {
          await audit(null, "LOGIN_BLOCKED", { username });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { username } });
        const ok = user?.isActive ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
        if (!user || !ok) {
          await failures.consume(username).catch(() => undefined);
          // ⚠️ Parol HECH QACHON yozilmaydi — faqat login.
          await audit(user?.id ?? null, "LOGIN_FAILED", { username });
          return null;
        }

        await failures.delete(username);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await audit(user.id, "LOGIN");

        return {
          id: user.id,
          name: user.fullName,
          username: user.username,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
