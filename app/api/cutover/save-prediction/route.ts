import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverParticipant, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ enabled: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const userId = await authenticatedCutoverParticipant(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!userId) return NextResponse.json({ enabled: false }, { status: 401, headers: CUTOVER_HEADERS });
    return NextResponse.json({ enabled: process.env.ENABLE_CUTOVER_PREDICTION_WRITES === "true" },
      { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ enabled: false }, { status: 503, headers: CUTOVER_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  if (!cutoverAuthEnabled() || process.env.ENABLE_CUTOVER_PREDICTION_WRITES !== "true")
    return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  const origin = process.env.CUTOVER_AUTH_ORIGIN;
  if (!origin || !origin.startsWith("https://") || req.headers.get("origin") !== origin)
    return NextResponse.json({ ok: false }, { status: 403, headers: CUTOVER_HEADERS });
  if (Number(req.headers.get("content-length") || 0) > 1024)
    return NextResponse.json({ ok: false }, { status: 413, headers: CUTOVER_HEADERS });
  try {
    const userId = await authenticatedCutoverParticipant(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: CUTOVER_HEADERS });
    const body = await req.json();
    const matchId = String(body?.match_id ?? "");
    const home = body?.home_pred;
    const away = body?.away_pred;
    if (!/^[1-9][0-9]{0,17}$/.test(matchId) ||
        !Number.isInteger(home) || !Number.isInteger(away) ||
        home < 0 || away < 0 || home > 99 || away > 99)
      return NextResponse.json({ ok: false, error: "invalid_prediction" }, { status: 400, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    // Requires scripts/cutover-enable-prediction-writes.sql on the isolated branch.
    // Both insert and conflict update enforce the server-side deadline.
    const saved = await sql`
      INSERT INTO footy_cutover.predictions (match_id, user_id, home_pred, away_pred)
      SELECT m.id, ${userId}::uuid, ${home}, ${away}
      FROM footy_cutover.matches m
      WHERE m.id = ${matchId}::bigint
        AND COALESCE(m.deadline_at, m.kickoff_at) > now()
        AND m.status = 'scheduled'
        AND ( ${process.env.CUTOVER_SHOW_TEST_MATCHES === "true"}::boolean OR NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id) )
      ON CONFLICT (match_id, user_id) DO UPDATE
        SET home_pred = EXCLUDED.home_pred, away_pred = EXCLUDED.away_pred, updated_at = now()
      WHERE EXISTS (
        SELECT 1 FROM footy_cutover.matches m
        WHERE m.id = EXCLUDED.match_id
          AND COALESCE(m.deadline_at, m.kickoff_at) > now()
          AND m.status = 'scheduled'
          AND ( ${process.env.CUTOVER_SHOW_TEST_MATCHES === "true"}::boolean OR NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id) )
      )
      RETURNING id
    `;
    if (saved.length === 0) return NextResponse.json({ ok: false, error: "match_closed_or_missing" }, { status: 409, headers: CUTOVER_HEADERS });
    return NextResponse.json({ ok: true, saved: true }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "write_unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
