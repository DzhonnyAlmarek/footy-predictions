import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // публичные пути
  if (
    pathname === "/" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/change-password") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logout") ||
    pathname.startsWith("/auth") // если где-то остался supabase callback
  ) {
    return NextResponse.next();
  }

  // защищённые зоны (все подпути тоже)
  const protectedPaths = ["/dashboard", "/admin", "/golden-boot", "/rating"];

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) return NextResponse.next();

  // ✅ ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ — fp_login
  const raw = req.cookies.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(raw).trim();

  if (!fpLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    // можно сохранить куда хотел попасть
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/golden-boot/:path*", "/rating/:path*"],
};
