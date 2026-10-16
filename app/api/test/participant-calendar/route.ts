import {NextRequest,NextResponse} from "next/server";
import {hashOpaqueToken} from "@/lib/participant-auth-tokens";
import {AUTH_HEADERS,PARTICIPANT_COOKIE,participantAuthEnabled,participantDatabase} from "@/lib/neon-participant-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const error=(e:string,status:number)=>NextResponse.json({error:e},{status,headers:AUTH_HEADERS});
export async function GET(req:NextRequest){
 if(!participantAuthEnabled())return error("not_available",404);
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/i.test(token))return error("unauthorized",401);
 try{
  const sql=participantDatabase(),hash=hashOpaqueToken(token);
  const session=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
  if(typeof session[0]?.user_id!=="string")return error("unauthorized",401);
  const rows=await sql`SELECT c.source,c.display_id,c.match_id::text,c.stage_id::text AS stage_id,c.tour_id::text AS tour_id,c.kickoff_at,c.deadline_at,c.status,c.is_deleted,c.has_test_edit,
    h.name AS home_team,a.name AS away_team,COALESCE(s.name,ds.name) AS stage_name,COALESCE(t.name,dt.name,dt.tour_no) AS tour_name, COALESCE(p.home_pred,pd.home_pred,orig.home_pred) AS my_home_pred,COALESCE(p.away_pred,pd.away_pred,orig.away_pred) AS my_away_pred,\n    CASE WHEN c.source='new' AND p.draft_id IS NOT NULL THEN 'test' WHEN c.source='imported' AND pd.match_id IS NOT NULL THEN 'test' WHEN orig.id IS NOT NULL THEN 'imported' ELSE 'none' END AS my_prediction_source,\n    (c.status='scheduled' AND c.deadline_at>now() AND c.kickoff_at>now() AND (s.status IN ('draft','published') OR (ds.status IN ('draft','published') AND NOT ds.is_deleted AND dt.draft_stage_id=ds.draft_id AND NOT dt.is_deleted))) AS prediction_editable
    FROM footy_sandbox.calendar_effective_v1 c
    JOIN migration_source.teams h ON h.id=c.home_team_id
    JOIN migration_source.teams a ON a.id=c.away_team_id
    LEFT JOIN migration_source.stages s ON s.id=c.stage_id
    LEFT JOIN migration_source.tours t ON t.id=c.tour_id\n    LEFT JOIN footy_sandbox.calendar_new_matches n ON c.source='new' AND n.draft_id=c.match_id\n    LEFT JOIN footy_sandbox.stage_drafts ds ON ds.draft_id=n.draft_stage_id\n    LEFT JOIN footy_sandbox.tour_drafts dt ON dt.draft_id=n.draft_tour_id\n    LEFT JOIN footy_sandbox.new_match_prediction_drafts p ON c.source='new' AND p.draft_id=c.match_id AND p.user_id=${session[0].user_id}::uuid\n    LEFT JOIN footy_sandbox.prediction_drafts pd ON c.source='imported' AND pd.match_id=c.match_id AND pd.user_id=${session[0].user_id}::uuid
    LEFT JOIN LATERAL (SELECT op.id,op.home_pred,op.away_pred FROM migration_source.predictions op WHERE c.source='imported' AND op.match_id=c.match_id AND op.user_id=${session[0].user_id}::uuid ORDER BY op.id DESC LIMIT 1) orig ON true\n    WHERE c.is_deleted=false ORDER BY c.kickoff_at ASC,c.source,c.match_id ASC LIMIT 700`;
  return NextResponse.json({rows,readonly:false,predictionsEnabledForNewMatches:process.env.ENABLE_NEON_NEW_MATCH_PREDICTIONS==='true',predictionsEnabledForImportedMatches:process.env.ENABLE_NEON_IMPORTED_MATCH_PREDICTIONS==='true'},{headers:AUTH_HEADERS});
 }catch{return error("data_unavailable",503);}
}
