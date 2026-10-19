import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverParticipant, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const userId = await authenticatedCutoverParticipant(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const matches = await sql`
      SELECT m.id::text AS match_id, m.kickoff_at, m.deadline_at, m.status,
             m.home_score, m.away_score, h.name AS home_team, a.name AS away_team,
             p.home_pred, p.away_pred,
             (m.status = 'scheduled' AND COALESCE(m.deadline_at, m.kickoff_at) > now()) AS predictions_open
      FROM footy_cutover.matches m
      LEFT JOIN footy_cutover.teams h ON h.id = m.home_team_id
      LEFT JOIN footy_cutover.teams a ON a.id = m.away_team_id
      LEFT JOIN footy_cutover.predictions p ON p.match_id = m.id AND p.user_id = ${userId}::uuid
      WHERE NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id = m.id)
      ORDER BY CASE WHEN m.status = 'scheduled' AND m.kickoff_at >= now() THEN 0 ELSE 1 END,
               CASE WHEN m.status = 'scheduled' AND m.kickoff_at >= now() THEN m.kickoff_at END ASC NULLS LAST,
               m.kickoff_at DESC NULLS LAST, m.id DESC LIMIT 250
    `;
    return NextResponse.json({ ok: true, matches }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
