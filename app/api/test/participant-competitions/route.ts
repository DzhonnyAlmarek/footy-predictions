import {NextRequest,NextResponse} from "next/server";
import {hashOpaqueToken} from "@/lib/participant-auth-tokens";
import {AUTH_HEADERS,PARTICIPANT_COOKIE,participantAuthEnabled,participantDatabase} from "@/lib/neon-participant-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const error=(code:string,status:number)=>NextResponse.json({error:code},{status,headers:AUTH_HEADERS});
export async function GET(req:NextRequest){
 if(!participantAuthEnabled())return error("not_available",404);
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/i.test(token))return error("unauthorized",401);
 try{
 const sql=participantDatabase(),hash=hashOpaqueToken(token);
 const auth=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
 if(typeof auth[0]?.user_id!=="string")return error("unauthorized",401);
 const stages=await sql`SELECT s.id::text AS id,s.name,s.status,s.is_current,
 count(c.match_id)::int AS match_count,
 count(c.match_id) FILTER(WHERE c.status='scheduled' AND c.kickoff_at>now())::int AS upcoming_count,
 count(c.match_id) FILTER(WHERE pr.user_id IS NOT NULL)::int AS predicted_count
 FROM migration_source.stages s
 LEFT JOIN footy_sandbox.calendar_effective_v1 c ON c.stage_id=s.id AND c.is_deleted=false
 LEFT JOIN footy_sandbox.effective_predictions_v1 pr ON pr.source=c.source AND pr.match_id=c.match_id AND pr.user_id=${auth[0].user_id}::uuid
 WHERE s.status IN ('published','locked') GROUP BY s.id,s.name,s.status,s.is_current
 ORDER BY s.is_current DESC,s.id DESC`;
 const tours=await sql`SELECT t.id::text AS id,t.stage_id::text AS stage_id,t.tour_no,t.name,
 count(c.match_id)::int AS match_count,
 count(c.match_id) FILTER(WHERE c.status='scheduled' AND c.kickoff_at>now())::int AS upcoming_count,
 count(c.match_id) FILTER(WHERE pr.user_id IS NOT NULL)::int AS predicted_count
 FROM migration_source.tours t JOIN migration_source.stages s ON s.id=t.stage_id AND s.status IN ('published','locked')
 LEFT JOIN footy_sandbox.calendar_effective_v1 c ON c.tour_id=t.id AND c.stage_id=t.stage_id AND c.is_deleted=false
 LEFT JOIN footy_sandbox.effective_predictions_v1 pr ON pr.source=c.source AND pr.match_id=c.match_id AND pr.user_id=${auth[0].user_id}::uuid
 GROUP BY t.id,t.stage_id,t.tour_no,t.name ORDER BY t.stage_id DESC,t.tour_no ASC,t.id ASC`;
 return NextResponse.json({stages,tours,sandbox:true},{headers:AUTH_HEADERS});
 }catch{return error("data_unavailable",503);}
}