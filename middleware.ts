import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This is the isolated Yandex/Neon deployment. Fail closed until all Supabase
// clients, mutations, auth and scheduled actions have been migrated and audited.
const IS_ISOLATED_TEST = process.env.DEPLOY_TARGET === "yandex-neon-test";

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (IS_ISOLATED_TEST) {
    if (pathname === "/api/test/health") return NextResponse.next();

    // No production Supabase traffic, login attempts, mutations or admin actions.
    // Even valid production cookies cannot unlock these endpoints.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "test_environment_not_ready" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (pathname === "/") {
      return new NextResponse(
        "Тестовая площадка готовится. Вход и операции отключены до завершения изоляции данных.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }
      );
    }

    // Static framework assets may load, but no application pages are available.
    if (pathname.startsWith("/_next/") || pathname.startsWith("/favicon")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Existing production behavior is untouched. This path is not a security
  // upgrade for production and must be reviewed separately.
  if (
    pathname === "/" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/change-password") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logout") ||
    pathname.startsWith("/auth")
  ) {
    return NextResponse.next();
  }

  const protectedPaths = ["/dashboard", "/admin", "/golden-boot", "/rating"];
  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) return NextResponse.next();

  const raw = req.cookies.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(raw).trim();
  if (!fpLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Match ALL application paths, including APIs. Next.js excludes internal
// static asset handlers; test routing above explicitly allows static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
