import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { AUTH_HEADERS, PARTICIPANT_COOKIE, participantAuthEnabled, participantDatabase } from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only match overview. This is NOT an admin write API.
export async function GET(req: NextRequest) {
  if (!participantAuthEnabled()) return NextResponse.json({error:"not_available"},{status:404,headers:AUTH_HEADERS});
  const token = req.cookies.get(PARTICIPANT_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({error:"unauthorized"},{status:401,headers:AUTH_HEADERS});
  try {
    const sql = participantDatabase();
    const hash = hashOpaqueToken(token);
    const session = await sql`SELECT test_auth.session_user(decode(${hash}, 'hex')) AS user_id`;
    if (typeof session[0]?.user_id !== "string") return NextResponse.json({error:"unauthorized"},{status:401,headers:AUTH_HEADERS});
    const rows = await sql`
      SELECT m.id::text AS id, m.kickoff_at, m.status, m.home_score, m.away_score,
             m.home_penalty_goals,m.away_penalty_goals,
             ht.name AS home_team,at.name AS away_team,
             s.name AS stage_name,t.name AS tour_name,
             (SELECT count(*)::int FROM migration_source.predictions p WHERE p.match_id=m.id) AS predictions_count,
             (SELECT count(*)::int FROM migration_source.points_ledger pl WHERE pl.match_id=m.id) AS scored_count
      FROM migration_source.matches m
      JOIN migration_source.teams ht ON ht.id=m.home_team_id
      JOIN migration_source.teams at ON at.id=m.away_team_id
      LEFT JOIN migration_source.stages s ON s.id=m.stage_id
      LEFT JOIN migration_source.tours t ON t.id=m.tour_id
      ORDER BY m.kickoff_at DESC NULLS LAST,m.id DESC LIMIT 600`;
    return NextResponse.json({rows},{headers:AUTH_HEADERS});
  } catch {
    return NextResponse.json({error:"data_unavailable"},{status:503,headers:AUTH_HEADERS});
  }
}
