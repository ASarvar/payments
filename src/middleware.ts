import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { BASE_PATH } from "@/lib/basePath";

const { auth } = NextAuth(authConfig);

const LOGIN_PATH = `${BASE_PATH}/login`;

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
  matcher: ["/((?!api/auth|api/warm|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
