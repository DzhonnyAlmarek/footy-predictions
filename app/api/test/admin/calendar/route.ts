import { NextRequest,NextResponse } from "next/server";
import {AUTH_HEADERS,participantDatabase,participantOriginAllowed} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers:AUTH_HEADERS});
const writesEnabled=()=>testAdminEnabled()&&process.env.ENABLE_NEON_TEST_CALENDAR_WRITES==="true";
// Calendar writes only affect footy_sandbox and require a separate, disabled-by-default flag.
export async function GET(req:NextRequest){
 if(!testAdminEnabled())return reply("not_available",404);
 try{
  if(!await requireTestAdmin(req))return reply("forbidden",403);
  const sql=participantDatabase();
  const [stages,tours,teams,newDrafts,edits]=await Promise.all([
   sql`SELECT id::text,name,status,is_current FROM migration_source.stages ORDER BY id`,
   sql`SELECT id::text,stage_id::text,name,tour_no FROM migration_source.tours ORDER BY stage_id,id`,
   sql`SELECT id::text,name FROM migration_source.teams ORDER BY name LIMIT 500`,
   sql`SELECT draft_id::text,stage_id::text,tour_id::text,home_team_id::text,away_team_id::text,kickoff_at,deadline_at,status,is_deleted,updated_at FROM footy_sandbox.calendar_new_matches ORDER BY draft_id DESC LIMIT 200`,
   sql`SELECT match_id::text,stage_id::text,tour_id::text,home_team_id::text,away_team_id::text,kickoff_at,deadline_at,status,is_deleted,updated_at FROM footy_sandbox.calendar_match_edits ORDER BY updated_at DESC LIMIT 200`
  ]);
  return NextResponse.json({readonly:!writesEnabled(),writeEnabled:writesEnabled(),stages,tours,teams,newDrafts,edits},{headers:AUTH_HEADERS});
 }catch{return reply("data_unavailable",503);}
}

const validId=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
const validDate=(s:unknown)=>typeof s==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s)&&Number.isFinite(Date.parse(s));
export async function POST(req:NextRequest){
 if(!writesEnabled())return reply("writes_disabled",404);
 if(!participantOriginAllowed(req))return reply("forbidden_origin",403);
 if(Number(req.headers.get("content-length")||0)>4096)return reply("invalid_body",400);
 try{
  if(!await requireTestAdmin(req))return reply("forbidden",403);
  const b=await req.json().catch(()=>null);
  if(!b||!validId(b.stageId)||!validId(b.tourId)||!validId(b.homeTeamId)||!validId(b.awayTeamId)||b.homeTeamId===b.awayTeamId||!validDate(b.kickoffAt)||!validDate(b.deadlineAt))return reply("invalid_match",400);
  const kickoff=new Date(b.kickoffAt).toISOString(),deadline=new Date(b.deadlineAt).toISOString();
  if(Date.parse(deadline)>Date.parse(kickoff))return reply("deadline_after_kickoff",400);
  const sql=participantDatabase();
  // Single SQL statement prevents race between validation and insertion.
  const rows=await sql`
   INSERT INTO footy_sandbox.calendar_new_matches(stage_id,tour_id,home_team_id,away_team_id,kickoff_at,deadline_at)
   SELECT s.id,t.id,h.id,a.id,${kickoff}::timestamptz,${deadline}::timestamptz
   FROM migration_source.stages s
   JOIN migration_source.tours t ON t.stage_id=s.id AND t.id=${b.tourId}
   JOIN migration_source.teams h ON h.id=${b.homeTeamId}
   JOIN migration_source.teams a ON a.id=${b.awayTeamId}
   WHERE s.id=${b.stageId} AND s.status='draft' AND h.id<>a.id
    AND NOT EXISTS(SELECT 1 FROM migration_source.matches m WHERE m.tour_id=t.id AND (m.home_team_id IN (h.id,a.id) OR m.away_team_id IN (h.id,a.id))
     AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_match_edits e WHERE e.match_id=m.id AND e.is_deleted=true))
    AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_match_edits e WHERE e.tour_id=t.id AND e.is_deleted=false AND (e.home_team_id IN (h.id,a.id) OR e.away_team_id IN (h.id,a.id)))
    AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches n WHERE n.tour_id=t.id AND n.is_deleted=false AND (n.home_team_id IN (h.id,a.id) OR n.away_team_id IN (h.id,a.id)))
   RETURNING draft_id::text`;
  if(rows.length===0)return reply("stage_tour_team_conflict_or_not_draft",409);
  return NextResponse.json({ok:true,draftId:rows[0].draft_id,testOnly:true},{headers:AUTH_HEADERS});
 }catch{return reply("data_unavailable",503);}
}
