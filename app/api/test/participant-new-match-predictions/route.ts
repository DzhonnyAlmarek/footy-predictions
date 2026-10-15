import {NextRequest,NextResponse} from "next/server";
import {hashOpaqueToken} from "@/lib/participant-auth-tokens";
import {AUTH_HEADERS,PARTICIPANT_COOKIE,participantAuthEnabled,participantDatabase,participantOriginAllowed} from "@/lib/neon-participant-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(error:string,status:number)=>NextResponse.json({ok:false,error},{status,headers:AUTH_HEADERS});
const enabled=()=>participantAuthEnabled()&&process.env.ENABLE_NEON_NEW_MATCH_PREDICTIONS==="true";
async function user(req:NextRequest){
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/i.test(token))return null;
 const sql=participantDatabase(),hash=hashOpaqueToken(token);
 const r=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
 return typeof r[0]?.user_id==="string"?r[0].user_id as string:null;
}
export async function GET(req:NextRequest){
 if(!participantAuthEnabled())return reply("not_available",404);
 try{
  const uid=await user(req);if(!uid)return reply("unauthorized",401);
  const sql=participantDatabase();
  const rows=await sql`SELECT n.draft_id::text AS match_id,n.kickoff_at,n.deadline_at,n.status,
   ht.name AS home_team,at.name AS away_team,p.home_pred,p.away_pred,p.updated_at,
   (n.is_deleted=false AND n.status='scheduled' AND n.deadline_at>now() AND n.kickoff_at>now()) AS editable
   FROM footy_sandbox.calendar_new_matches n
   JOIN migration_source.teams ht ON ht.id=n.home_team_id JOIN migration_source.teams at ON at.id=n.away_team_id
   LEFT JOIN footy_sandbox.new_match_prediction_drafts p ON p.draft_id=n.draft_id AND p.user_id=${uid}::uuid
   WHERE n.is_deleted=false ORDER BY n.kickoff_at ASC,n.draft_id ASC LIMIT 200`;
  return NextResponse.json({matches:rows,readonly:!enabled(),sandbox:true},{headers:AUTH_HEADERS});
 }catch{return reply("data_unavailable",503);}
}
export async function POST(req:NextRequest){
 if(!enabled())return reply("writes_disabled",404);
 if(!participantOriginAllowed(req))return reply("forbidden_origin",403);
 if(Number(req.headers.get("content-length")||0)>2048)return reply("invalid_payload",413);
 try{
  const uid=await user(req);if(!uid)return reply("unauthorized",401);
  const b=await req.json().catch(()=>null);
  if(!b||typeof b.matchId!=="number"||!Number.isSafeInteger(b.matchId)||b.matchId<=0||
   !Number.isInteger(b.homePred)||!Number.isInteger(b.awayPred)||b.homePred<0||b.awayPred<0||b.homePred>30||b.awayPred>30)return reply("invalid_payload",400);
  const sql=participantDatabase();
  const rows=await sql`INSERT INTO footy_sandbox.new_match_prediction_drafts(user_id,draft_id,home_pred,away_pred)
   SELECT ${uid}::uuid,n.draft_id,${b.homePred},${b.awayPred}
   FROM footy_sandbox.calendar_new_matches n
   JOIN migration_source.stages s ON s.id=n.stage_id
   WHERE n.draft_id=${b.matchId} AND n.is_deleted=false AND n.status='scheduled'
    AND s.status IN ('draft','published') AND n.deadline_at>now() AND n.kickoff_at>now()
   ON CONFLICT(user_id,draft_id) DO UPDATE SET home_pred=EXCLUDED.home_pred,away_pred=EXCLUDED.away_pred,updated_at=now()
   WHERE EXISTS(SELECT 1 FROM footy_sandbox.calendar_new_matches n WHERE n.draft_id=EXCLUDED.draft_id
    AND n.is_deleted=false AND n.status='scheduled' AND n.deadline_at>now() AND n.kickoff_at>now())
   RETURNING draft_id::text,home_pred,away_pred`;
  if(rows.length===0)return reply("deadline_or_match_unavailable",409);
  return NextResponse.json({ok:true,sandbox:true,prediction:rows[0]},{headers:AUTH_HEADERS});
 }catch{return reply("data_unavailable",503);}
}
