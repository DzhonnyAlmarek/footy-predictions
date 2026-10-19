import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Grand Prix is a separate competition. Never add these points to the ordinary leaderboard.
export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const seasons = await sql`
      SELECT id::text, name, slug FROM footy_cutover.grand_prix_seasons ORDER BY id
    `;
    const rounds = await sql`
      SELECT r.id::text, r.season_id::text, r.round_no, r.name, r.source_type,
             r.stage_id::text
      FROM footy_cutover.grand_prix_rounds r
      ORDER BY r.season_id, r.round_no, r.id
    `;
    const ratings = await sql`
      WITH manual_points AS (
        SELECT r.season_id, r.id AS round_id, m.user_id, SUM(m.points) AS points
        FROM footy_cutover.grand_prix_rounds r
        JOIN footy_cutover.grand_prix_manual_scores m ON m.round_id = r.id
        WHERE r.source_type = 'manual'
        GROUP BY r.season_id, r.id, m.user_id
      ), stage_points AS (
        SELECT r.season_id, r.id AS round_id, l.user_id, SUM(l.points) AS points
        FROM footy_cutover.grand_prix_rounds r
        JOIN footy_cutover.matches mt ON mt.stage_id = r.stage_id
        JOIN footy_cutover.points_ledger l ON l.match_id = mt.id
        WHERE r.source_type = 'stage'
          AND NOT EXISTS (
            SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id = mt.id
          )
        GROUP BY r.season_id, r.id, l.user_id
      ), combined AS (
        SELECT * FROM manual_points UNION ALL SELECT * FROM stage_points
      )
      SELECT c.season_id::text, p.username, SUM(c.points)::numeric AS points,
             COUNT(DISTINCT c.round_id)::int AS scored_rounds
      FROM combined c JOIN footy_cutover.profiles p ON p.id = c.user_id
      WHERE p.username IS NOT NULL
      GROUP BY c.season_id, p.id, p.username
      ORDER BY c.season_id, points DESC, scored_rounds DESC, p.username
    `;
    return NextResponse.json({ ok: true, seasons, rounds, ratings }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
