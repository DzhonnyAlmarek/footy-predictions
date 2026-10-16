import {NextRequest,NextResponse} from "next/server";
import {hashOpaqueToken} from "@/lib/participant-auth-tokens";
import {AUTH_HEADERS,PARTICIPANT_COOKIE,participantAuthEnabled,participantDatabase} from "@/lib/neon-participant-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const failure=(error:string,status:number)=>NextResponse.json({error},{status,headers:AUTH_HEADERS});
export async function GET(req:NextRequest){
 if(!participantAuthEnabled())return failure("not_available",404);
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/i.test(token))return failure("unauthorized",401);
 try{
 const sql=participantDatabase(),hash=hashOpaqueToken(token);
 const s=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
 if(typeof s[0]?.user_id!=="string")return failure("unauthorized",401);
 const stage=await sql`SELECT id,name FROM migration_source.stages WHERE is_current=true AND status='published' LIMIT 1`;
 if(!stage.length)return NextResponse.json({stage:null,users:[],matches:[],entries:[]},{headers:AUTH_HEADERS});
 const users=await sql`SELECT id::text AS id,username FROM migration_source.profiles WHERE role='user' AND username IS NOT NULL ORDER BY username`;
 const matches=await sql`SELECT c.source,c.match_id::text AS match_id,c.display_id,c.kickoff_at,c.status,
 h.name home_team,a.name away_team,t.name tour_name,
 CASE WHEN c.source='imported' THEN r.preview_home_score ELSE NULL END AS home_score,
 CASE WHEN c.source='imported' THEN r.preview_away_score ELSE NULL END AS away_score
 FROM footy_sandbox.calendar_effective_v1 c
 JOIN migration_source.teams h ON h.id=c.home_team_id JOIN migration_source.teams a ON a.id=c.away_team_id
 LEFT JOIN migration_source.tours t ON t.id=c.tour_id
 LEFT JOIN footy_sandbox.match_results_preview_v1 r ON r.match_id=c.match_id AND c.source='imported'
 WHERE c.stage_id=${stage[0].id} AND c.is_deleted=false ORDER BY c.kickoff_at,c.match_id LIMIT 250`;
 const entries=await sql`SELECT p.source,p.match_id::text AS match_id,p.user_id::text AS user_id,p.home_pred,p.away_pred,
 score.points,score.points_outcome,score.points_diff,score.points_h1,score.points_h2,score.points_bonus
 FROM footy_sandbox.effective_predictions_v1 p
 LEFT JOIN footy_sandbox.score_effective_v2 score ON score.source=p.source AND score.match_id=p.match_id AND score.user_id=p.user_id
 WHERE EXISTS(SELECT 1 FROM footy_sandbox.calendar_effective_v1 c WHERE c.source=p.source AND c.match_id=p.match_id AND c.stage_id=${stage[0].id} AND c.is_deleted=false)`;
 return NextResponse.json({stage:stage[0],users,matches,entries,readOnly:true,sandbox:true},{headers:AUTH_HEADERS});
 }catch{return failure("data_unavailable",503);}
}