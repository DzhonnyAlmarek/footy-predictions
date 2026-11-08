import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LEGACY_SESSION_COOKIE, verifyLegacySession } from "@/lib/legacy-session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Protect participant/admin pages and write-capable APIs with the same signed session.
  // Other public endpoints and scheduled jobs preserve their existing access rules.
  const areas = [
    "/dashboard", "/admin", "/golden-boot", "/golden-whistle",
    "/analytics", "/grand-prix", "/rating", "/leaderboard", "/match",
    "/change-password", "/whoami",
    "/api/predictions", "/api/change-password", "/api/admin",
  ];
  const protectedRoute = areas.some(area => pathname===area || pathname.startsWith(area+"/"));
  if (!protectedRoute || pathname==="/api/admin/backup/cron") return NextResponse.next();

  const login=await verifyLegacySession(req.cookies.get(LEGACY_SESSION_COOKIE)?.value);
  if (login && (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin") || login==="ADMIN")) {
    // The signed cookie is the only trusted identity. Restore a canonical
    // UTF-8 fp_login request cookie for legacy server components and APIs.
    // Avoid comparing independent Cyrillic cookies that may be decoded
    // differently by Edge middleware and the Node.js request runtime.
    const headers=new Headers(req.headers);
    const existing=(headers.get("cookie")??"")
      .split(";")
      .map(part=>part.trim())
      .filter(part=>part && !part.startsWith("fp_login="));
    existing.push("fp_login="+encodeURIComponent(login));
    headers.set("cookie",existing.join("; "));
    return NextResponse.next({request:{headers}});
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ok:false,error:"session_expired"},{status:401,headers:{"Cache-Control":"no-store"}});
  }
  const url=req.nextUrl.clone();
  url.pathname="/";
  url.search="";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/admin/:path*", "/golden-boot/:path*",
    "/golden-whistle/:path*", "/analytics/:path*", "/grand-prix/:path*",
    "/rating/:path*", "/leaderboard/:path*", "/match/:path*",
    "/change-password/:path*", "/whoami/:path*",
    "/api/predictions/:path*", "/api/change-password/:path*", "/api/admin/:path*",
  ],
};
