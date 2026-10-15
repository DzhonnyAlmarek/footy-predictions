import { NextRequest,NextResponse } from "next/server";
import {AUTH_HEADERS,participantDatabase} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(error:string,status:number)=>NextResponse.json({error},{status,headers:AUTH_HEADERS});
// The calendar migration is strictly read-only until a separate, reviewed write API is implemented.
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
  return NextResponse.json({readonly:true,writeEnabled:false,stages,tours,teams,newDrafts,edits},{headers:AUTH_HEADERS});
 }catch{return reply("data_unavailable",503);}
}
