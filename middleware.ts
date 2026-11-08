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
  const cookieLogin=req.cookies.get("fp_login")?.value;
  const storedLogin= cookieLogin ? (()=>{try{return decodeURIComponent(cookieLogin).trim().toUpperCase();}catch{return "";}})() : "";
  if (login && login===storedLogin && (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin") || login==="ADMIN")) {
    return NextResponse.next();
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
