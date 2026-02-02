import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 🔹 публичные пути (НИЧЕГО НЕ ДЕЛАЕМ)
  if (
    pathname === "/" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/change-password") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // 🔹 защищённые зоны
  const protectedPaths = [
    "/dashboard",
    "/admin",
    "/golden-boot",
    "/rating",
  ];

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // 🔹 проверяем маркер логина
  const fpAuth = req.cookies.get("fp_auth")?.value;

  if (!fpAuth) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/golden-boot/:path*",
    "/rating/:path*",
  ],
};
