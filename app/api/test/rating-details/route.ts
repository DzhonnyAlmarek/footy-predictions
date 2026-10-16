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
 const session=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
 if(typeof session[0]?.user_id!=="string")return failure("unauthorized",401);
 const requested=req.nextUrl.searchParams.get("user");
 if(requested!==null&&!/^[a-f0-9-]{36}$/i.test(requested))return failure("invalid_user",400);
 const uid=requested||session[0].user_id as string;
 const profile=await sql`SELECT id,username FROM migration_source.profiles WHERE id=${uid}::uuid AND role='user' LIMIT 1`;
 if(!profile.length)return failure("not_found",404);
 const rows=await sql`
  WITH scored AS (
    SELECT COALESCE(n.match_id,o.match_id) match_id,COALESCE(n.points,0)::numeric test_points,
     COALESCE(o.points,0)::numeric original_points,
     COALESCE(n.points_outcome,0)::numeric outcome,COALESCE(n.points_diff,0)::numeric diff,
     COALESCE(n.points_h1,0)::numeric home,COALESCE(n.points_h2,0)::numeric away,
     COALESCE(n.points_bonus,0)::numeric near_bonus,\n     COALESCE(o.points_outcome,0)::numeric original_outcome,COALESCE(o.points_diff,0)::numeric original_diff,\n     COALESCE(o.points_h1,0)::numeric original_home,COALESCE(o.points_h2,0)::numeric original_away,\n     COALESCE(o.points_bonus,0)::numeric original_near_bonus
    FROM (SELECT * FROM footy_sandbox.score_effective_v2 WHERE source='imported' AND user_id=${uid}::uuid) n
    FULL JOIN (SELECT * FROM footy_sandbox.score_preview_v1 WHERE user_id=${uid}::uuid) o USING(match_id)
  )
  SELECT s.match_id::text,m.kickoff_at,ht.name home_team,at.name away_team,
   m.home_score original_home_score,m.away_score original_away_score,
   v.preview_home_score test_home_score,v.preview_away_score test_away_score,
   ep.home_pred,ep.away_pred,ep.has_test_override prediction_overridden,v.has_test_override result_overridden,
   s.original_points,s.test_points,(s.test_points-s.original_points)::numeric(8,2) delta,
   s.outcome,s.diff,s.home,s.away,s.near_bonus,\n   s.original_outcome,s.original_diff,s.original_home,s.original_away,s.original_near_bonus
  FROM scored s JOIN migration_source.matches m ON m.id=s.match_id
  JOIN footy_sandbox.match_results_preview_v1 v ON v.match_id=s.match_id
  JOIN migration_source.teams ht ON ht.id=m.home_team_id
  JOIN migration_source.teams at ON at.id=m.away_team_id
  LEFT JOIN footy_sandbox.effective_predictions_v1 ep ON ep.source='imported' AND ep.match_id=s.match_id AND ep.user_id=${uid}::uuid
  ORDER BY abs(s.test_points-s.original_points) DESC,m.kickoff_at DESC,s.match_id DESC LIMIT 600`;
 return NextResponse.json({username:profile[0].username,rows,sandbox:true,readOnly:true},{headers:AUTH_HEADERS});
 }catch{return failure("data_unavailable",503);}
}