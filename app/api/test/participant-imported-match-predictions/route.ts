import {NextRequest,NextResponse} from "next/server";
import {hashOpaqueToken} from "@/lib/participant-auth-tokens";
import {AUTH_HEADERS,PARTICIPANT_COOKIE,participantAuthEnabled,participantDatabase,participantOriginAllowed} from "@/lib/neon-participant-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const error=(code:string,status:number)=>NextResponse.json({ok:false,error:code},{status,headers:AUTH_HEADERS});
const enabled=()=>participantAuthEnabled()&&process.env.ENABLE_NEON_IMPORTED_MATCH_PREDICTIONS==="true";
export async function POST(req:NextRequest){
 if(!enabled())return error("writes_disabled",404);
 if(!participantOriginAllowed(req))return error("forbidden_origin",403);
 if(Number(req.headers.get("content-length")||0)>2048)return error("invalid_payload",413);
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/i.test(token))return error("unauthorized",401);
 const body=await req.json().catch(()=>null);
 if(!body||typeof body.matchId!=="number"||!Number.isSafeInteger(body.matchId)||body.matchId<1||!Number.isInteger(body.homePred)||!Number.isInteger(body.awayPred)||body.homePred<0||body.homePred>30||body.awayPred<0||body.awayPred>30)return error("invalid_payload",400);
 try{
  const sql=participantDatabase(),hash=hashOpaqueToken(token);
  const session=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
  const userId=session[0]?.user_id;if(typeof userId!=="string")return error("unauthorized",401);
  const rows=await sql`INSERT INTO footy_sandbox.prediction_drafts(user_id,match_id,home_pred,away_pred)
    SELECT ${userId}::uuid,c.match_id,${body.homePred},${body.awayPred}
    FROM footy_sandbox.calendar_effective_v1 c
    JOIN migration_source.stages s ON s.id=c.stage_id
    WHERE c.source='imported' AND c.match_id=${body.matchId} AND c.is_deleted=false
     AND c.status='scheduled' AND s.status IN ('draft','published')
     AND c.deadline_at>now() AND c.kickoff_at>now()
    ON CONFLICT(user_id,match_id) DO UPDATE SET home_pred=EXCLUDED.home_pred,away_pred=EXCLUDED.away_pred,updated_at=now()
    WHERE EXISTS(SELECT 1 FROM footy_sandbox.calendar_effective_v1 c
      WHERE c.source='imported' AND c.match_id=EXCLUDED.match_id AND c.is_deleted=false
       AND c.status='scheduled' AND c.deadline_at>now() AND c.kickoff_at>now())
    RETURNING match_id::text,home_pred,away_pred,updated_at`;
  if(!rows.length)return error("deadline_or_match_unavailable",409);
  return NextResponse.json({ok:true,sandbox:true,prediction:rows[0]},{headers:AUTH_HEADERS});
 }catch{return error("data_unavailable",503);}
}
