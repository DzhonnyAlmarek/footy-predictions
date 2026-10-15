import {NextRequest,NextResponse} from "next/server";
import {AUTH_HEADERS,participantDatabase,participantOriginAllowed} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";export const dynamic="force-dynamic";
const err=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers:AUTH_HEADERS});
const writable=()=>testAdminEnabled()&&process.env.ENABLE_NEON_TEST_CALENDAR_WRITES==="true";
const idOk=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
const dateOk=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v));
export async function GET(req:NextRequest){
 if(!testAdminEnabled())return err("not_available",404);
 try{
  if(!await requireTestAdmin(req))return err("forbidden",403);
  const id=req.nextUrl.searchParams.get("matchId");if(!id||!/^\d{1,15}$/.test(id))return err("invalid_match",400);
  const sql=participantDatabase();
  const original=await sql`SELECT m.id::text,m.stage_id::text,m.tour_id::text,m.home_team_id::text,m.away_team_id::text,m.kickoff_at,m.deadline_at,m.status,
    h.name AS home_team,a.name AS away_team,s.name AS stage_name,t.name AS tour_name,s.status AS stage_status
    FROM migration_source.matches m JOIN migration_source.teams h ON h.id=m.home_team_id JOIN migration_source.teams a ON a.id=m.away_team_id
    LEFT JOIN migration_source.stages s ON s.id=m.stage_id LEFT JOIN migration_source.tours t ON t.id=m.tour_id WHERE m.id=${id}::bigint LIMIT 1`;
  if(original.length!==1)return err("match_not_found",404);
  const draft=await sql`SELECT match_id::text,stage_id::text,tour_id::text,home_team_id::text,away_team_id::text,kickoff_at,deadline_at,status,is_deleted FROM footy_sandbox.calendar_match_edits WHERE match_id=${id}::bigint LIMIT 1`;
  return NextResponse.json({ok:true,readonly:!writable(),original:original[0],draft:draft[0]||null},{headers:AUTH_HEADERS});
 }catch{return err("data_unavailable",503);}
}
export async function POST(req:NextRequest){
 if(!writable())return err("writes_disabled",404);
 if(!participantOriginAllowed(req))return err("forbidden_origin",403);
 if(Number(req.headers.get("content-length")||0)>4096)return err("invalid_body",400);
 try{
  if(!await requireTestAdmin(req))return err("forbidden",403);
  const b=await req.json().catch(()=>null);
  if(!b||!idOk(b.matchId)||!idOk(b.stageId)||!idOk(b.tourId)||!idOk(b.homeTeamId)||!idOk(b.awayTeamId)||b.homeTeamId===b.awayTeamId||!dateOk(b.kickoffAt)||!dateOk(b.deadlineAt)||typeof b.isDeleted!=="boolean")return err("invalid_match",400);
  const kickoff=new Date(b.kickoffAt).toISOString(),deadline=new Date(b.deadlineAt).toISOString();
  if(Date.parse(deadline)>Date.parse(kickoff))return err("deadline_after_kickoff",400);
  const sql=participantDatabase();
  const rows=await sql`INSERT INTO footy_sandbox.calendar_match_edits(match_id,stage_id,tour_id,home_team_id,away_team_id,kickoff_at,deadline_at,status,is_deleted,updated_at)
   SELECT m.id,s.id,t.id,h.id,a.id,${kickoff}::timestamptz,${deadline}::timestamptz,m.status,${b.isDeleted},now()
   FROM migration_source.matches m JOIN migration_source.stages s ON s.id=${b.stageId} AND s.status IN ('draft','published')
   JOIN migration_source.tours t ON t.id=${b.tourId} AND t.stage_id=s.id
   JOIN migration_source.teams h ON h.id=${b.homeTeamId} JOIN migration_source.teams a ON a.id=${b.awayTeamId}
   WHERE m.id=${b.matchId} AND m.stage_id=s.id AND h.id<>a.id
   AND NOT EXISTS(SELECT 1 FROM migration_source.matches other WHERE other.id<>m.id AND other.tour_id=t.id
     AND (other.home_team_id IN(h.id,a.id) OR other.away_team_id IN(h.id,a.id))
     AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_match_edits e WHERE e.match_id=other.id AND e.is_deleted=true))
   AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches n WHERE n.tour_id=t.id AND n.is_deleted=false AND (n.home_team_id IN(h.id,a.id) OR n.away_team_id IN(h.id,a.id)))
   ON CONFLICT(match_id) DO UPDATE SET stage_id=EXCLUDED.stage_id,tour_id=EXCLUDED.tour_id,home_team_id=EXCLUDED.home_team_id,away_team_id=EXCLUDED.away_team_id,kickoff_at=EXCLUDED.kickoff_at,deadline_at=EXCLUDED.deadline_at,status=EXCLUDED.status,is_deleted=EXCLUDED.is_deleted,updated_at=now()
   RETURNING match_id::text`;
  return rows.length?NextResponse.json({ok:true,testOnly:true},{headers:AUTH_HEADERS}):err("conflict_or_locked_stage",409);
 }catch{return err("data_unavailable",503);}
}
export async function DELETE(req:NextRequest){
 if(!writable())return err("writes_disabled",404);
 if(!participantOriginAllowed(req))return err("forbidden_origin",403);
 try{
  if(!await requireTestAdmin(req))return err("forbidden",403);
  const id=req.nextUrl.searchParams.get("matchId");if(!id||!/^\d{1,15}$/.test(id))return err("invalid_match",400);
  const sql=participantDatabase();
  await sql`DELETE FROM footy_sandbox.calendar_match_edits WHERE match_id=${id}::bigint`;
  return NextResponse.json({ok:true,testOnly:true},{headers:AUTH_HEADERS});
 }catch{return err("data_unavailable",503);}
}
