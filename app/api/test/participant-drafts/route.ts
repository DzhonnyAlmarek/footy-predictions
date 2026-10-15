import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { AUTH_HEADERS, PARTICIPANT_COOKIE, participantAuthEnabled, participantDatabase, participantOriginAllowed } from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The draft table is deliberately NOT in migration_source. It cannot be overwritten by source sync.
function enabled() {
  return participantAuthEnabled() && process.env.ENABLE_NEON_PREDICTION_DRAFTS === "true";
}
async function authenticatedUser(req: NextRequest) {
  const token = req.cookies.get(PARTICIPANT_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const sql = participantDatabase();
  const hash = hashOpaqueToken(token);
  const result = await sql`SELECT test_auth.session_user(decode(${hash}, 'hex')) AS user_id`;
  return typeof result[0]?.user_id === "string" ? result[0].user_id as string : null;
}
export async function GET(req: NextRequest) {
  if (!enabled()) return NextResponse.json({error:"not_available"}, {status:404,headers:AUTH_HEADERS});
  try {
    const userId = await authenticatedUser(req);
    if (!userId) return NextResponse.json({error:"unauthorized"}, {status:401,headers:AUTH_HEADERS});
    const sql = participantDatabase();
    const rows = await sql`
      SELECT m.id::text AS match_id, m.kickoff_at, m.deadline_at,
             ht.name AS home_team, at.name AS away_team,
             d.home_pred, d.away_pred, d.updated_at,
             (m.kickoff_at > now() AND m.status = 'scheduled') AS editable
      FROM migration_source.matches m
      JOIN migration_source.teams ht ON ht.id = m.home_team_id
      JOIN migration_source.teams at ON at.id = m.away_team_id
      LEFT JOIN footy_sandbox.prediction_drafts d ON d.match_id = m.id AND d.user_id = ${userId}::uuid
      WHERE m.status = 'scheduled' AND m.kickoff_at > now() - interval '1 day'
      ORDER BY m.kickoff_at ASC, m.id ASC
      LIMIT 150`;
    return NextResponse.json({matches: rows, sandbox:true}, {headers:AUTH_HEADERS});
  } catch {
    return NextResponse.json({error:"data_unavailable"}, {status:503,headers:AUTH_HEADERS});
  }
}
export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({error:"not_available"}, {status:404,headers:AUTH_HEADERS});
  if (!participantOriginAllowed(req)) return NextResponse.json({error:"invalid_origin"}, {status:403,headers:AUTH_HEADERS});
  if (Number(req.headers.get("content-length") || 0) > 2048)
    return NextResponse.json({error:"invalid_payload"}, {status:413,headers:AUTH_HEADERS});
  try {
    const userId = await authenticatedUser(req);
    if (!userId) return NextResponse.json({error:"unauthorized"}, {status:401,headers:AUTH_HEADERS});
    const body = await req.json().catch(() => null);
    const matchId = body?.match_id;
    const home = body?.home_pred;
    const away = body?.away_pred;
    if (typeof matchId !== "string" || !/^[1-9]\d{0,17}$/.test(matchId) ||
        !Number.isInteger(home) || !Number.isInteger(away) ||
        home < 0 || away < 0 || home > 30 || away > 30)
      return NextResponse.json({error:"invalid_payload"}, {status:400,headers:AUTH_HEADERS});
    const sql = participantDatabase();
    // Kickoff is the authoritative deadline. At kickoff or later writes are rejected in SQL.
    const rows = await sql`
      INSERT INTO footy_sandbox.prediction_drafts(user_id, match_id, home_pred, away_pred)
      SELECT ${userId}::uuid, m.id, ${home}, ${away}
      FROM migration_source.matches m
      WHERE m.id = ${matchId}::bigint AND m.status = 'scheduled' AND m.kickoff_at > now()
      ON CONFLICT(user_id, match_id) DO UPDATE
      SET home_pred = excluded.home_pred, away_pred = excluded.away_pred, updated_at = now()
      RETURNING match_id::text AS match_id, home_pred, away_pred, updated_at`;
    if (!rows.length) return NextResponse.json({error:"deadline_or_match_unavailable"}, {status:409,headers:AUTH_HEADERS});
    return NextResponse.json({ok:true, draft:rows[0], sandbox:true}, {headers:AUTH_HEADERS});
  } catch {
    return NextResponse.json({error:"data_unavailable"}, {status:503,headers:AUTH_HEADERS});
  }
}


export async function DELETE(req: NextRequest) {
  if (!enabled()) return NextResponse.json({error:"not_available"}, {status:404,headers:AUTH_HEADERS});
  if (!participantOriginAllowed(req)) return NextResponse.json({error:"invalid_origin"}, {status:403,headers:AUTH_HEADERS});
  if (Number(req.headers.get("content-length") || 0) > 2048)
    return NextResponse.json({error:"invalid_payload"}, {status:413,headers:AUTH_HEADERS});
  try {
    const userId = await authenticatedUser(req);
    if (!userId) return NextResponse.json({error:"unauthorized"}, {status:401,headers:AUTH_HEADERS});
    const body = await req.json().catch(() => null);
    const matchId = body?.match_id;
    if (typeof matchId !== "string" || !/^[1-9]\d{0,17}$/.test(matchId))
      return NextResponse.json({error:"invalid_payload"}, {status:400,headers:AUTH_HEADERS});
    const sql = participantDatabase();
    // A kickoff-guarded DELETE; a missing draft is harmless, but an expired match is not editable.
    const rows = await sql`
      DELETE FROM footy_sandbox.prediction_drafts d
      USING migration_source.matches m
      WHERE d.match_id = m.id AND d.match_id = ${matchId}::bigint
        AND d.user_id = ${userId}::uuid
        AND m.status = 'scheduled' AND m.kickoff_at > now()
      RETURNING d.match_id::text AS match_id`;
    if (rows.length) return NextResponse.json({ok:true, deleted:true, sandbox:true},{headers:AUTH_HEADERS});
    const match = await sql`
      SELECT id FROM migration_source.matches
      WHERE id = ${matchId}::bigint AND status='scheduled' AND kickoff_at > now()`;
    if (!match.length) return NextResponse.json({error:"deadline_or_match_unavailable"},{status:409,headers:AUTH_HEADERS});
    return NextResponse.json({ok:true,deleted:false,sandbox:true},{headers:AUTH_HEADERS});
  } catch {
    return NextResponse.json({error:"data_unavailable"}, {status:503,headers:AUTH_HEADERS});
  }
}
