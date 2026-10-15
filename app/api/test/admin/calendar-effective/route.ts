import {NextRequest,NextResponse} from "next/server";
import {AUTH_HEADERS,participantDatabase} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(!testAdminEnabled())return NextResponse.json({error:"not_available"},{status:404,headers:AUTH_HEADERS});
 try{
  if(!await requireTestAdmin(req))return NextResponse.json({error:"forbidden"},{status:403,headers:AUTH_HEADERS});
  const sql=participantDatabase();
  const rows=await sql`SELECT c.source,c.match_id::text,c.display_id,c.kickoff_at,c.deadline_at,c.status,c.is_deleted,c.has_test_edit,
   h.name AS home_team,a.name AS away_team,s.name AS stage_name,t.name AS tour_name
   FROM footy_sandbox.calendar_effective_v1 c
   JOIN migration_source.teams h ON h.id=c.home_team_id
   JOIN migration_source.teams a ON a.id=c.away_team_id
   LEFT JOIN migration_source.stages s ON s.id=c.stage_id
   LEFT JOIN migration_source.tours t ON t.id=c.tour_id
   ORDER BY c.kickoff_at DESC,c.source,c.match_id DESC LIMIT 700`;
  return NextResponse.json({rows,total:rows.length,readonly:true},{headers:AUTH_HEADERS});
 }catch{return NextResponse.json({error:"data_unavailable"},{status:503,headers:AUTH_HEADERS});}
}
