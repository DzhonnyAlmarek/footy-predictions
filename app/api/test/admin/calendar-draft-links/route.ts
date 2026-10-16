import {NextRequest,NextResponse} from "next/server";
import {AUTH_HEADERS,participantDatabase,participantOriginAllowed} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:AUTH_HEADERS});
const enabled=()=>testAdminEnabled()&&process.env.ENABLE_NEON_TEST_CALENDAR_DRAFT_LINKS==="true"&&process.env.ENABLE_NEON_TEST_CALENDAR_WRITES==="true";
const id=(x:unknown):x is number=>typeof x==="number"&&Number.isSafeInteger(x)&&x>0;
export async function GET(req:NextRequest){
 if(!testAdminEnabled())return reply({error:"not_available"},404);
 try{
  if(!await requireTestAdmin(req))return reply({error:"forbidden"},403);
  const sql=participantDatabase();
  const stages=await sql`SELECT draft_id::text,name,status FROM footy_sandbox.stage_drafts WHERE NOT is_deleted AND status='draft' ORDER BY draft_id`;
  const tours=await sql`SELECT draft_id::text,draft_stage_id::text,imported_stage_id::text,tour_no,name FROM footy_sandbox.tour_drafts WHERE NOT is_deleted ORDER BY draft_id`;
  const columns=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='footy_sandbox' AND table_name='calendar_new_matches' AND column_name IN ('draft_stage_id','draft_tour_id')`;
  const matches=columns.length===2?await sql`SELECT n.draft_id::text,n.draft_stage_id::text,n.draft_tour_id::text,n.home_team_id::text,n.away_team_id::text,n.kickoff_at,n.deadline_at,n.is_deleted,s.name AS stage_name,t.tour_no,t.name AS tour_name FROM footy_sandbox.calendar_new_matches n JOIN footy_sandbox.stage_drafts s ON s.draft_id=n.draft_stage_id JOIN footy_sandbox.tour_drafts t ON t.draft_id=n.draft_tour_id ORDER BY n.draft_id DESC LIMIT 200`:[];
  return reply({stages,tours,matches,writeEnabled:enabled()&&columns.length===2,schemaReady:columns.length===2});
 }catch{return reply({error:"data_unavailable"},503);}
}
export async function POST(req:NextRequest){
 if(!enabled())return reply({error:"writes_disabled"},404);
 if(!participantOriginAllowed(req))return reply({error:"forbidden_origin"},403);
 if(Number(req.headers.get("content-length")||0)>4096)return reply({error:"invalid_body"},400);
 try{
  if(!await requireTestAdmin(req))return reply({error:"forbidden"},403);
  const b=await req.json().catch(()=>null);
  if(!b||!id(b.draftStageId)||!id(b.draftTourId)||!id(b.homeTeamId)||!id(b.awayTeamId)||b.homeTeamId===b.awayTeamId||typeof b.kickoffAt!=="string"||typeof b.deadlineAt!=="string")return reply({error:"invalid_match"},400);
  const k=Date.parse(b.kickoffAt),d=Date.parse(b.deadlineAt);
  if(!Number.isFinite(k)||!Number.isFinite(d)||d>k)return reply({error:"invalid_dates"},400);
  const sql=participantDatabase();
  const rows=await sql`INSERT INTO footy_sandbox.calendar_new_matches(stage_id,tour_id,draft_stage_id,draft_tour_id,home_team_id,away_team_id,kickoff_at,deadline_at)
   SELECT NULL,NULL,s.draft_id,t.draft_id,h.id,a.id,${new Date(k).toISOString()}::timestamptz,${new Date(d).toISOString()}::timestamptz
   FROM footy_sandbox.stage_drafts s JOIN footy_sandbox.tour_drafts t ON t.draft_stage_id=s.draft_id
   JOIN migration_source.teams h ON h.id=${b.homeTeamId} JOIN migration_source.teams a ON a.id=${b.awayTeamId}
   WHERE s.draft_id=${b.draftStageId} AND t.draft_id=${b.draftTourId} AND s.status='draft' AND NOT s.is_deleted AND NOT t.is_deleted AND h.id<>a.id
   AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches n WHERE n.draft_tour_id=t.draft_id AND NOT n.is_deleted AND (n.home_team_id IN(h.id,a.id) OR n.away_team_id IN(h.id,a.id)))
   RETURNING draft_id::text`;
  return rows.length?reply({ok:true,testOnly:true,draftId:rows[0].draft_id},201):reply({error:"stage_tour_team_conflict"},409);
 }catch{return reply({error:"data_unavailable"},503);}
}

export async function PATCH(req:NextRequest){
 if(!enabled())return reply({error:"writes_disabled"},404);
 if(!participantOriginAllowed(req))return reply({error:"forbidden_origin"},403);
 if(Number(req.headers.get("content-length")||0)>4096)return reply({error:"invalid_body"},400);
 try{
  if(!await requireTestAdmin(req))return reply({error:"forbidden"},403);
  const b=await req.json().catch(()=>null);
  if(!b||!id(b.draftId)||!["edit","delete","restore"].includes(b.action))return reply({error:"invalid_match"},400);
  const sql=participantDatabase();
  if(b.action==="delete"){
   const rows=await sql`UPDATE footy_sandbox.calendar_new_matches n SET is_deleted=true,updated_at=now()
    WHERE n.draft_id=${b.draftId} AND n.draft_stage_id IS NOT NULL AND NOT n.is_deleted
    AND EXISTS(SELECT 1 FROM footy_sandbox.stage_drafts s WHERE s.draft_id=n.draft_stage_id AND s.status='draft' AND NOT s.is_deleted)
    RETURNING draft_id::text`;
   return rows.length?reply({ok:true,testOnly:true}):reply({error:"draft_not_editable"},409);
  }
  if(b.action==="restore"){
   const rows=await sql`UPDATE footy_sandbox.calendar_new_matches n SET is_deleted=false,updated_at=now()
    WHERE n.draft_id=${b.draftId} AND n.draft_stage_id IS NOT NULL AND n.is_deleted
    AND EXISTS(SELECT 1 FROM footy_sandbox.stage_drafts s JOIN footy_sandbox.tour_drafts t ON t.draft_stage_id=s.draft_id
      WHERE s.draft_id=n.draft_stage_id AND t.draft_id=n.draft_tour_id AND s.status='draft' AND NOT s.is_deleted AND NOT t.is_deleted)
    AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches x WHERE x.draft_id<>n.draft_id AND x.draft_tour_id=n.draft_tour_id AND NOT x.is_deleted
      AND (x.home_team_id IN(n.home_team_id,n.away_team_id) OR x.away_team_id IN(n.home_team_id,n.away_team_id)))
    RETURNING draft_id::text`;
   return rows.length?reply({ok:true,testOnly:true}):reply({error:"draft_not_editable"},409);
  }
  if(!id(b.draftStageId)||!id(b.draftTourId)||!id(b.homeTeamId)||!id(b.awayTeamId)||b.homeTeamId===b.awayTeamId||typeof b.kickoffAt!=="string"||typeof b.deadlineAt!=="string")return reply({error:"invalid_match"},400);
  const k=Date.parse(b.kickoffAt),d=Date.parse(b.deadlineAt);
  if(!Number.isFinite(k)||!Number.isFinite(d)||d>k)return reply({error:"invalid_dates"},400);
  const rows=await sql`UPDATE footy_sandbox.calendar_new_matches n
   SET draft_stage_id=${b.draftStageId},draft_tour_id=${b.draftTourId},home_team_id=${b.homeTeamId},away_team_id=${b.awayTeamId},
    kickoff_at=${new Date(k).toISOString()}::timestamptz,deadline_at=${new Date(d).toISOString()}::timestamptz,updated_at=now()
   WHERE n.draft_id=${b.draftId} AND n.draft_stage_id IS NOT NULL AND NOT n.is_deleted
   AND EXISTS(SELECT 1 FROM footy_sandbox.stage_drafts s JOIN footy_sandbox.tour_drafts t ON t.draft_stage_id=s.draft_id
    WHERE s.draft_id=${b.draftStageId} AND t.draft_id=${b.draftTourId} AND s.status='draft' AND NOT s.is_deleted AND NOT t.is_deleted)
   AND EXISTS(SELECT 1 FROM migration_source.teams WHERE id=${b.homeTeamId})
   AND EXISTS(SELECT 1 FROM migration_source.teams WHERE id=${b.awayTeamId})
   AND NOT EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches x WHERE x.draft_id<>n.draft_id AND x.draft_tour_id=${b.draftTourId} AND NOT x.is_deleted
    AND (x.home_team_id IN(${b.homeTeamId},${b.awayTeamId}) OR x.away_team_id IN(${b.homeTeamId},${b.awayTeamId})))
   RETURNING draft_id::text`;
  return rows.length?reply({ok:true,testOnly:true}):reply({error:"draft_not_editable"},409);
 }catch{return reply({error:"data_unavailable"},503);}
}
