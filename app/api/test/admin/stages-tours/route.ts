import {NextRequest,NextResponse} from "next/server";
import {AUTH_HEADERS,participantDatabase,participantOriginAllowed} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";export const dynamic="force-dynamic";
const respond=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:AUTH_HEADERS});
const enabled=()=>testAdminEnabled()&&process.env.ENABLE_NEON_TEST_STAGE_TOUR_WRITES==="true";
const id=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
const name=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=160;
const tourNo=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=40;
export async function GET(req:NextRequest){
 if(!testAdminEnabled())return respond({error:"not_available"},404);
 try{
  if(!await requireTestAdmin(req))return respond({error:"forbidden"},403);
  const sql=participantDatabase();
  // Imported source remains immutable. Overlay tables are required only when the migration is applied.
  const stages=await sql`SELECT s.id::text,s.name,s.status,s.is_current,s.matches_required FROM migration_source.stages s ORDER BY s.id`;
  const tours=await sql`SELECT id::text,stage_id::text,tour_no,name FROM migration_source.tours ORDER BY stage_id,id`;
  return respond({stages,tours,writeEnabled:enabled(),overlayReady:false});
 }catch{return respond({error:"data_unavailable"},503);}
}
export async function POST(req:NextRequest){
 if(!enabled())return respond({error:"writes_disabled"},404);
 if(!participantOriginAllowed(req))return respond({error:"forbidden_origin"},403);
 if(Number(req.headers.get("content-length")||0)>4096)return respond({error:"invalid_body"},400);
 try{
  if(!await requireTestAdmin(req))return respond({error:"forbidden"},403);
  const b=await req.json().catch(()=>null);
  if(!b||!["stage","tour"].includes(b.kind))return respond({error:"invalid_body"},400);
  const sql=participantDatabase();
  if(b.kind==="stage"){
   if(!name(b.name)||b.matchesRequired!==undefined&&(!id(b.matchesRequired)||b.matchesRequired>1000))return respond({error:"invalid_stage"},400);
   const rows=await sql`INSERT INTO footy_sandbox.stage_drafts(name,matches_required) VALUES (${b.name.trim()},${b.matchesRequired||56}) RETURNING draft_id::text`;
   return respond({ok:true,testOnly:true,draftId:rows[0].draft_id},201);
  }
  if(!tourNo(b.tourNo)||!name(b.name)||!(id(b.importedStageId)!==id(b.draftStageId)))return respond({error:"invalid_tour"},400);
  const rows=await sql`INSERT INTO footy_sandbox.tour_drafts(imported_stage_id,draft_stage_id,tour_no,name)
   SELECT s.id,NULL,${b.tourNo.trim()},${b.name.trim()} FROM migration_source.stages s
   WHERE s.id=${b.importedStageId||0} AND s.status='draft'
   AND NOT EXISTS(SELECT 1 FROM migration_source.tours t WHERE t.stage_id=s.id AND t.tour_no=${b.tourNo.trim()})
   AND NOT EXISTS(SELECT 1 FROM footy_sandbox.tour_drafts t WHERE t.imported_stage_id=s.id AND t.tour_no=${b.tourNo.trim()} AND NOT t.is_deleted)
   UNION ALL
   SELECT NULL,s.draft_id,${b.tourNo.trim()},${b.name.trim()} FROM footy_sandbox.stage_drafts s
   WHERE s.draft_id=${b.draftStageId||0} AND s.status='draft' AND NOT s.is_deleted
   AND NOT EXISTS(SELECT 1 FROM footy_sandbox.tour_drafts t WHERE t.draft_stage_id=s.draft_id AND t.tour_no=${b.tourNo.trim()} AND NOT t.is_deleted)
   RETURNING draft_id::text`;
  return rows.length?respond({ok:true,testOnly:true,draftId:rows[0].draft_id},201):respond({error:"stage_or_tour_conflict"},409);
 }catch{return respond({error:"data_unavailable"},503);}
}
export async function PATCH(req:NextRequest){
 if(!enabled())return respond({error:"writes_disabled"},404);
 if(!participantOriginAllowed(req))return respond({error:"forbidden_origin"},403);
 if(Number(req.headers.get("content-length")||0)>4096)return respond({error:"invalid_body"},400);
 try{
  if(!await requireTestAdmin(req))return respond({error:"forbidden"},403);
  const b=await req.json().catch(()=>null);
  if(!b||!name(b.name)||!id(b.id)||!["imported-stage","draft-stage","imported-tour","draft-tour"].includes(b.kind))return respond({error:"invalid_body"},400);
  const sql=participantDatabase();let rows;
  if(b.kind==="draft-stage")rows=await sql`UPDATE footy_sandbox.stage_drafts SET name=${b.name.trim()},updated_at=now() WHERE draft_id=${b.id} AND status='draft' AND NOT is_deleted RETURNING draft_id::text`;
  else if(b.kind==="imported-stage")rows=await sql`INSERT INTO footy_sandbox.stage_edits(stage_id,name,matches_required)
   SELECT id,${b.name.trim()},matches_required FROM migration_source.stages WHERE id=${b.id} AND status='draft'
   ON CONFLICT(stage_id) DO UPDATE SET name=EXCLUDED.name,updated_at=now() RETURNING stage_id::text`;
  else if(b.kind==="draft-tour")rows=await sql`UPDATE footy_sandbox.tour_drafts SET name=${b.name.trim()},updated_at=now() WHERE draft_id=${b.id} AND NOT is_deleted RETURNING draft_id::text`;
  else rows=await sql`INSERT INTO footy_sandbox.tour_edits(tour_id,name)
   SELECT t.id,${b.name.trim()} FROM migration_source.tours t JOIN migration_source.stages s ON s.id=t.stage_id
   WHERE t.id=${b.id} AND s.status='draft'
   ON CONFLICT(tour_id) DO UPDATE SET name=EXCLUDED.name,updated_at=now() RETURNING tour_id::text`;
  return rows.length?respond({ok:true,testOnly:true}):respond({error:"not_editable"},409);
 }catch{return respond({error:"data_unavailable"},503);}
}
