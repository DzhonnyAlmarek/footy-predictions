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
      pathname === "/api/test/matches" || pathname === "/test-matches" ||
      pathname === "/api/test/schedule" || pathname === "/test-schedule" || pathname === "/test-login" ||
      pathname === "/api/test/login" || pathname === "/api/test/logout" ||
      pathname === "/api/test/session") {
    return NextResponse.next();
  }

  if (pathname === "/test-area") {
    const authenticated = await verifyTestSession(req.cookies.get(COOKIE_NAME)?.value);
    if (authenticated) return NextResponse.next();
    return NextResponse.redirect(new URL("/test-login", req.url));
  }

  // Read-only participant cabinet on the explicitly isolated Yandex test runtime.
  // Every participant API independently validates its Neon session and database scope.
  const participantRoutes = new Set([
    "/test-participant-login", "/test-participant-predictions", "/test-participant-home",
    "/api/test/participant-login", "/api/test/participant-users", "/api/test/participant-session",
    "/api/test/participant-predictions", "/api/test/participant-logout",
    "/test-participant-drafts", "/api/test/participant-drafts",
    "/test-participant-ratings", "/api/test/participant-ratings",
    "/test-match-overview", "/api/test/match-overview",
    "/test-change-password", "/api/test/change-password",
    "/api/test/participant-new-match-predictions", "/test-participant-new-match-predictions",
    "/api/test/participant-imported-match-predictions",
    "/test-participant-calendar", "/api/test/participant-calendar",
    "/test-participant-competitions", "/api/test/participant-competitions",
    "/test-participant-current-table", "/api/test/participant-current-table",
    "/test-rating-effective", "/api/test/rating-effective",
    "/test-rating-details", "/api/test/rating-details",
    "/test-new-match-score-simulation", "/api/test/new-match-score-simulation",
  ]);
  if (participantRoutes.has(pathname) &&
      process.env.DEPLOY_TARGET === "yandex-neon-test" &&
      process.env.ENABLE_NEON_PARTICIPANT_AUTH === "true") {
    return NextResponse.next();
  }

  // Administrative test API is disabled unless an explicit separate flag is enabled.
  // Each request also checks the ADMIN role and an enabled database credential.
  if ((pathname === "/test-admin-home" || pathname === "/test-admin-stages" || pathname === "/api/test/admin/stages-tours" || pathname === "/api/test/admin/calendar-draft-links" || pathname === "/api/test/admin/dashboard" || pathname === "/api/test/admin/matches" || pathname === "/api/test/admin/result-draft" || pathname === "/api/test/admin/ratings-preview" || pathname === "/api/test/admin/calendar" || pathname === "/api/test/admin/calendar-imported" || pathname === "/api/test/admin/calendar-effective" || pathname === "/test-admin-calendar-all" || pathname === "/test-admin-calendar-imported" || pathname === "/test-admin-calendar" || pathname === "/test-admin-results" || pathname === "/test-admin-new-match-results" || pathname === "/api/test/admin/new-match-simulations") &&
      process.env.DEPLOY_TARGET === "yandex-neon-test" &&
      process.env.ENABLE_NEON_PARTICIPANT_AUTH === "true" &&
      process.env.ENABLE_NEON_TEST_ADMIN === "true") {
    return NextResponse.next();
  }

  // Invitation-only enrollment, separately gated and never enabled by default.
  if ((pathname === "/test-participant-enroll" || pathname === "/api/test/enroll") &&
      process.env.DEPLOY_TARGET === "yandex-neon-test" &&
      process.env.ENABLE_NEON_PARTICIPANT_AUTH === "true" &&
      process.env.ENABLE_NEON_PARTICIPANT_ENROLLMENT === "true") {
    return NextResponse.next();
  }

  // Developer-only local E2E test gate. NEVER enable on deployed test/production:
  // both dev mode and the exact loopback Host must match.
  const localAuthRoutes = new Set([
    "/api/test/enroll", "/api/test/participant-login",
    "/api/test/participant-session", "/api/test/participant-logout",
    "/api/test/migration-schedule", "/migration-schedule",
    "/api/test/migration-standings", "/migration-standings",
  ]);
  const previewHost = process.env.CODESPACE_NAME
    ? `${process.env.CODESPACE_NAME}-3100.app.github.dev` : null;
  const previewRoutes = new Set(["/migration-schedule", "/api/test/migration-schedule",
    "/migration-standings", "/api/test/migration-standings"]);
  const host = req.headers.get("host");
  if (localAuthRoutes.has(pathname) &&
      process.env.NODE_ENV === "development" &&
      process.env.LOCAL_NEON_AUTH_E2E === "true" &&
      (host === "127.0.0.1:3100" ||
       (previewRoutes.has(pathname) && previewHost !== null &&
        (host === previewHost || host === "localhost:3100")))) {
    return NextResponse.next();
  }

  // Opt-in, read-only cutover verification endpoint; route enforces its own token.
  if ((pathname === "/cutover-participant" || pathname === "/api/cutover/leaderboard" || pathname === "/api/cutover/admin" || pathname === "/api/cutover/save-prediction" || pathname === "/api/cutover/schedule" || pathname === "/api/cutover/summary" || pathname === "/api/cutover/matches" || pathname === "/api/cutover/prediction-coverage" || pathname === "/api/cutover/validation" || pathname === "/api/cutover/my-predictions" || pathname === "/api/cutover/session" || pathname === "/api/cutover/logout" || pathname === "/api/cutover/login" || pathname === "/api/cutover/participants") &&
      ((process.env.DEPLOY_TARGET === "yandex-neon-cutover-preview" &&
        process.env.ENABLE_CUTOVER_PREVIEW === "true") ||
       (process.env.DEPLOY_TARGET === "yandex-neon-production-candidate" &&
        process.env.ENABLE_CUTOVER_PRODUCTION_CANDIDATE === "true" &&
        process.env.ENABLE_CUTOVER_PREVIEW === "true"))) {
    return NextResponse.next();
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
