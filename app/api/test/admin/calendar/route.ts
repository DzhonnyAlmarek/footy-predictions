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
  const stages=await sql`SELECT id::text,name,status,is_current FROM migration_source.stages ORDER BY id`;
  const tours=await sql`SELECT id::text,stage_id::text,name,tour_no FROM migration_source.tours ORDER BY stage_id,id`;
  const teams=await sql`SELECT id::text,name FROM migration_source.teams ORDER BY name LIMIT 500`;
  const newDrafts=await sql`SELECT draft_id::text,stage_id::text,tour_id::text,home_team_id::text,away_team_id::text,kickoff_at,deadline_at,status,is_deleted,updated_at FROM footy_sandbox.calendar_new_matches ORDER BY draft_id DESC LIMIT 200`;
  const edits=await sql`SELECT match_id::text,stage_id::text,tour_id::text,home_team_id::text,away_team_id::text,kickoff_at,deadline_at,status,is_deleted,updated_at FROM footy_sandbox.calendar_match_edits ORDER BY updated_at DESC LIMIT 200`;
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

export async function PATCH(req:NextRequest){
 if(!writesEnabled())return reply("writes_disabled",404);
 if(!participantOriginAllowed(req))return reply("forbidden_origin",403);
 if(Number(req.headers.get("content-length")||0)>4096)return reply("invalid_body",400);
 try{
  if(!await requireTestAdmin(req))return reply("forbidden",403);
  const b=await req.json().catch(()=>null);
  if(!b||!validId(b.draftId)||!["edit","delete","restore"].includes(b.action))return reply("invalid_match",400);
  const sql=participantDatabase();
  if(b.action==="delete"){
   const rows=await sql`UPDATE footy_sandbox.calendar_new_matches SET is_deleted=true,updated_at=now()
    WHERE draft_id=${b.draftId} AND is_deleted=false AND EXISTS
    (SELECT 1 FROM migration_source.stages s WHERE s.id=stage_id AND s.status='draft')
    RETURNING draft_id::text`;
   return rows.length?NextResponse.json({ok:true,testOnly:true},{headers:AUTH_HEADERS}):reply("draft_not_editable",409);
  }
  if(b.action==="restore"){
   // A restored team must still be free in its tour.
   const rows=await sql`UPDATE footy_sandbox.calendar_new_matches n SET is_deleted=false,updated_at=now()
    WHERE n.draft_id=${b.draftId} AND n.is_deleted=true
    AND EXISTS(SELECT 1 FROM migration_source.stages s WHERE s.id=n.stage_id AND s.status='draft')
    AND NOT EXISTS(SELECT 1 FROM migration_source.matches m WHERE m.tour_id=n.tour_id AND
      (m.home_team_id IN(n.home_team_id,n.away_team_id) OR m.away_team_id IN(n.home_team_id,n.away_team_id)))
    AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches other WHERE other.draft_id<>n.draft_id AND other.tour_id=n.tour_id AND other.is_deleted=false AND
      (other.home_team_id IN(n.home_team_id,n.away_team_id) OR other.away_team_id IN(n.home_team_id,n.away_team_id)))
    RETURNING n.draft_id::text`;
   return rows.length?NextResponse.json({ok:true,testOnly:true},{headers:AUTH_HEADERS}):reply("draft_not_editable",409);
  }
  if(!validId(b.stageId)||!validId(b.tourId)||!validId(b.homeTeamId)||!validId(b.awayTeamId)||b.homeTeamId===b.awayTeamId||!validDate(b.kickoffAt)||!validDate(b.deadlineAt))return reply("invalid_match",400);
  const kickoff=new Date(b.kickoffAt).toISOString(),deadline=new Date(b.deadlineAt).toISOString();
  if(Date.parse(deadline)>Date.parse(kickoff))return reply("deadline_after_kickoff",400);
  const rows=await sql`UPDATE footy_sandbox.calendar_new_matches n
    SET stage_id=${b.stageId},tour_id=${b.tourId},home_team_id=${b.homeTeamId},away_team_id=${b.awayTeamId},
        kickoff_at=${kickoff}::timestamptz,deadline_at=${deadline}::timestamptz,updated_at=now()
    WHERE n.draft_id=${b.draftId} AND n.is_deleted=false
    AND EXISTS(SELECT 1 FROM migration_source.stages s JOIN migration_source.tours t ON t.stage_id=s.id
      WHERE s.id=${b.stageId} AND s.status='draft' AND t.id=${b.tourId})
    AND EXISTS(SELECT 1 FROM migration_source.teams WHERE id=${b.homeTeamId})
    AND EXISTS(SELECT 1 FROM migration_source.teams WHERE id=${b.awayTeamId})
    AND NOT EXISTS(SELECT 1 FROM migration_source.matches m WHERE m.tour_id=${b.tourId}
      AND (m.home_team_id IN(${b.homeTeamId},${b.awayTeamId}) OR m.away_team_id IN(${b.homeTeamId},${b.awayTeamId})))
    AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches other WHERE other.draft_id<>n.draft_id AND other.tour_id=${b.tourId} AND other.is_deleted=false
      AND (other.home_team_id IN(${b.homeTeamId},${b.awayTeamId}) OR other.away_team_id IN(${b.homeTeamId},${b.awayTeamId})))
    RETURNING n.draft_id::text`;
  return rows.length?NextResponse.json({ok:true,testOnly:true},{headers:AUTH_HEADERS}):reply("draft_not_editable",409);
 }catch{return reply("data_unavailable",503);}
}
