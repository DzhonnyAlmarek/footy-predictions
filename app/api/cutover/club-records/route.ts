import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only club history. Only officially locked stages and the current stage;
// draft stages and test matches never participate.
export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const rows = await sql`
      SELECT s.id::text AS stage_id, s.name AS stage_name, s.status AS stage_status,
        s.is_current, t.id::text AS tour_id, t.name AS tour_name,
        m.id::text AS match_id, m.kickoff_at, m.home_score, m.away_score,
        h.name AS home_team, a.name AS away_team,
        p.id::text AS user_id, p.username,
        pr.home_pred, pr.away_pred, l.points
      FROM footy_cutover.points_ledger l
      JOIN footy_cutover.matches m ON m.id=l.match_id
      JOIN footy_cutover.stages s ON s.id=m.stage_id
      JOIN footy_cutover.tours t ON t.id=m.tour_id
      JOIN footy_cutover.profiles p ON p.id=l.user_id
      JOIN footy_cutover.predictions pr ON pr.user_id=p.id AND pr.match_id=m.id
      JOIN footy_cutover.teams h ON h.id=m.home_team_id
      JOIN footy_cutover.teams a ON a.id=m.away_team_id
      WHERE (s.status='locked' OR (s.is_current=true AND s.status='published'))
        AND m.status='finished' AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
        AND p.username IS NOT NULL AND UPPER(p.username)<>'ADMIN'
        AND LOWER(COALESCE(p.role,''))<>'admin'
        AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches x WHERE x.match_id=m.id)
      ORDER BY m.kickoff_at, m.id, p.username
    `;
    return NextResponse.json({ ok: true, rows }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
