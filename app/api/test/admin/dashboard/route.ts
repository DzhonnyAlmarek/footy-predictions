import {NextRequest,NextResponse} from "next/server";
import {AUTH_HEADERS,participantDatabase} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";export const dynamic="force-dynamic";
const error=(code:string,status:number)=>NextResponse.json({ok:false,error:code},{status,headers:AUTH_HEADERS});
export async function GET(req:NextRequest){
 if(!testAdminEnabled())return error("not_available",404);
 try{
  if(!await requireTestAdmin(req))return error("forbidden",403);
  const sql=participantDatabase();
  const stages=await sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE is_current)::int AS current FROM migration_source.stages`;
  const matches=await sql`SELECT count(*)::int AS imported FROM migration_source.matches`;
  const drafts=await sql`SELECT count(*) FILTER(WHERE NOT is_deleted)::int AS new_matches FROM footy_sandbox.calendar_new_matches`;
  const overrides=await sql`SELECT count(*)::int AS result_overrides FROM footy_sandbox.match_result_overrides`;
  const edits=await sql`SELECT count(*)::int AS calendar_edits FROM footy_sandbox.calendar_match_edits`;
  const users=await sql`SELECT count(*) FILTER(WHERE role='user')::int AS participants FROM migration_source.profiles`;
  return NextResponse.json({ok:true,summary:{stages:stages[0]?.total||0,importedMatches:matches[0]?.imported||0,newMatches:drafts[0]?.new_matches||0,resultOverrides:overrides[0]?.result_overrides||0,calendarEdits:edits[0]?.calendar_edits||0,participants:users[0]?.participants||0},sandbox:true},{headers:AUTH_HEADERS});
 }catch{return error("data_unavailable",503);}
}