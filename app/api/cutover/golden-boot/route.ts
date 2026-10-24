import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(request.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const rows = await sql`
      SELECT u.username, COUNT(*)::int AS exact
      FROM footy_cutover.predictions p
      JOIN footy_cutover.profiles u ON u.id = p.user_id
      JOIN footy_cutover.matches m ON m.id = p.match_id
      WHERE m.home_score IS NOT NULL AND m.away_score IS NOT NULL
        AND p.home_pred = m.home_score AND p.away_pred = m.away_score
      GROUP BY u.id, u.username
      ORDER BY exact DESC, u.username ASC
    `;
    return NextResponse.json({ ok: true, leaderboard: rows }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
