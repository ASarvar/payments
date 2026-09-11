import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { BASE_PATH } from "@/lib/basePath";

// Middleware faqat edge-safe authConfig'dan foydalanadi (Prisma import qilinmaydi).
const { auth } = NextAuth(authConfig);

const LOGIN_PATH = `${BASE_PATH}/login`;

// ⚠️ NextAuth'ning O'ZIDAGI signIn redirect'i Next.js basePath'ni HISOBGA OLMAYDI,
//    shuning uchun himoya va redirect shu yerda QO'LDA (obyektlar ilovasidagi bilan bir xil).
//    Tashqi domen `Host` / `X-Forwarded-*` sarlavhalaridan olinadi — `nextUrl.origin`
//    reverse-proxy ortida ichki `127.0.0.1:3000` ni ko'rsatadi.
export default auth((req) => {
  if (req.auth) return;

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === LOGIN_PATH) return;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");

  const loginUrl = new URL(LOGIN_PATH, `${proto}://${host}`);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  // Statik fayllar, logotiplar va auth API'dan tashqari hamma narsa himoyalangan.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
