import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { AUTH_HEADERS, PARTICIPANT_COOKIE, participantAuthEnabled, participantDatabase } from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!participantAuthEnabled()) return NextResponse.json({ error: "not_available" }, { status: 404, headers: AUTH_HEADERS });
  const token = req.cookies.get(PARTICIPANT_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: AUTH_HEADERS });
  }
  try {
    const sql = participantDatabase();
    const hash = hashOpaqueToken(token);
    const session = await sql`SELECT test_auth.session_user(decode(${hash}, 'hex')) AS user_id`;
    const userId = session[0]?.user_id;
    if (typeof userId !== "string") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: AUTH_HEADERS });
    }
    // No user ID is accepted from the client. Session identity is authoritative.
    const profiles = await sql`SELECT username FROM migration_source.profiles WHERE id = ${userId}::uuid LIMIT 1`;
    if (profiles.length !== 1) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: AUTH_HEADERS });
    const rows = await sql`
      SELECT p.id::text AS prediction_id, p.match_id::text AS match_id,
             p.home_pred, p.away_pred, p.updated_at,
             m.kickoff_at, m.status, m.home_score, m.away_score,
             ht.name AS home_team, at.name AS away_team,
             s.name AS stage_name, t.name AS tour_name,
             ps.total AS prediction_points
      FROM migration_source.predictions p
      JOIN migration_source.matches m ON m.id = p.match_id
      LEFT JOIN migration_source.teams ht ON ht.id = m.home_team_id
      LEFT JOIN migration_source.teams at ON at.id = m.away_team_id
      LEFT JOIN migration_source.stages s ON s.id = m.stage_id
      LEFT JOIN migration_source.tours t ON t.id = m.tour_id
      LEFT JOIN migration_source.prediction_scores ps
        ON ps.prediction_id = p.id AND ps.user_id = p.user_id
      WHERE p.user_id = ${userId}::uuid
      ORDER BY m.kickoff_at DESC NULLS LAST, p.id DESC
      LIMIT 500`;
    return NextResponse.json({ username: profiles[0].username, predictions: rows }, { headers: AUTH_HEADERS });
  } catch {
    return NextResponse.json({ error: "data_unavailable" }, { status: 503, headers: AUTH_HEADERS });
  }
}
