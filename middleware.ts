import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifyTestSession } from "@/lib/test-auth";

// This branch is an isolated sandbox, regardless of environment overrides.
// Production login, routes and Supabase API operations MUST remain inaccessible.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  if (pathname === "/api/test/health" || pathname === "/api/test/neon-health" ||
      pathname === "/api/test/matches" || pathname === "/test-matches" || pathname === "/test-login" ||
      pathname === "/api/test/login" || pathname === "/api/test/logout" ||
      pathname === "/api/test/session") {
    return NextResponse.next();
  }

  if (pathname === "/test-area") {
    const authenticated = await verifyTestSession(req.cookies.get(COOKIE_NAME)?.value);
    if (authenticated) return NextResponse.next();
    return NextResponse.redirect(new URL("/test-login", req.url));
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "isolated_test_api_disabled" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (pathname === "/") {
    return new NextResponse(
      "Изолированная тестовая площадка. Вход: /test-login. Основные функции временно отключены.",
      { status: 503, headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow"
      } }
    );
  }
  return NextResponse.redirect(new URL("/", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
