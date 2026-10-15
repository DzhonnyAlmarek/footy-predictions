import { NextRequest, NextResponse } from "next/server";
import { AUTH_HEADERS, participantDatabase, participantOriginAllowed } from "@/lib/neon-participant-server";
import { requireTestAdmin, testAdminEnabled } from "@/lib/test-neon-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (error: string, status: number) => NextResponse.json({ok:false,error},{status,headers:AUTH_HEADERS});
const writesEnabled = () => testAdminEnabled() && process.env.ENABLE_NEON_TEST_RESULT_WRITES === "true";
const matchIdValid = (v:unknown):v is number => typeof v==="number" && Number.isSafeInteger(v) && v>0;
const goalValid = (v:unknown):v is number => typeof v==="number" && Number.isInteger(v) && v>=0 && v<=30;

export async function GET(req:NextRequest) {
 if(!testAdminEnabled()) return reply("not_available",404);
 try {
  if(!await requireTestAdmin(req)) return reply("forbidden",403);
  const raw=req.nextUrl.searchParams.get("matchId");
  if(!raw || !/^\d{1,15}$/.test(raw)) return reply("invalid_match",400);
  const sql=participantDatabase();
  const rows=await sql`SELECT match_id::text, original_status, original_home_score, original_away_score,
    preview_status, preview_home_score, preview_away_score, has_test_override
    FROM footy_sandbox.match_results_preview_v1 WHERE match_id=${raw}::bigint LIMIT 1`;
  if(rows.length!==1) return reply("match_not_found",404);
  return NextResponse.json({readonly:!writesEnabled(),match:rows[0]},{headers:AUTH_HEADERS});
 } catch {return reply("data_unavailable",503);}
}

export async function POST(req:NextRequest) {
 if(!writesEnabled()) return reply("writes_disabled",404);
 if(!participantOriginAllowed(req)) return reply("forbidden_origin",403);
 if(Number(req.headers.get("content-length")||0)>2048) return reply("invalid_body",400);
 try {
  if(!await requireTestAdmin(req)) return reply("forbidden",403);
  const body=await req.json();
  const {matchId,homeScore,awayScore}=body??{};
  const homePenalties=body?.homePenaltyGoals??0,awayPenalties=body?.awayPenaltyGoals??0;
  if(!matchIdValid(matchId)||!goalValid(homeScore)||!goalValid(awayScore)||
    !goalValid(homePenalties)||!goalValid(awayPenalties)||
    homePenalties>homeScore||awayPenalties>awayScore) return reply("invalid_result",400);
  const sql=participantDatabase();
  const rows=await sql`INSERT INTO footy_sandbox.match_result_overrides
   (match_id,home_score,away_score,home_penalty_goals,away_penalty_goals,updated_at)
   SELECT m.id,${homeScore},${awayScore},${homePenalties},${awayPenalties},now()
   FROM migration_source.matches m WHERE m.id=${matchId} AND m.kickoff_at<=now()
   ON CONFLICT(match_id) DO UPDATE SET home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,
   home_penalty_goals=EXCLUDED.home_penalty_goals,away_penalty_goals=EXCLUDED.away_penalty_goals,updated_at=now()
   RETURNING match_id::text`;
  if(rows.length!==1) return reply("match_not_started_or_missing",409);
  return NextResponse.json({ok:true,matchId:rows[0].match_id,testOnly:true},{headers:AUTH_HEADERS});
 } catch {return reply("data_unavailable",503);}
}

export async function DELETE(req:NextRequest) {
 if(!writesEnabled()) return reply("writes_disabled",404);
 if(!participantOriginAllowed(req)) return reply("forbidden_origin",403);
 try {
  if(!await requireTestAdmin(req)) return reply("forbidden",403);
  const raw=req.nextUrl.searchParams.get("matchId");
  if(!raw||!/^\d{1,15}$/.test(raw)) return reply("invalid_match",400);
  const sql=participantDatabase();
  await sql`DELETE FROM footy_sandbox.match_result_overrides WHERE match_id=${raw}::bigint`;
  return NextResponse.json({ok:true,testOnly:true},{headers:AUTH_HEADERS});
 } catch {return reply("data_unavailable",503);}
}
