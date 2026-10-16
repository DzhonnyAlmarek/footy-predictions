import {NextRequest,NextResponse} from "next/server";
import {hashOpaqueToken} from "@/lib/participant-auth-tokens";
import {AUTH_HEADERS,PARTICIPANT_COOKIE,participantAuthEnabled,participantDatabase} from "@/lib/neon-participant-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const err=(error:string,status:number)=>NextResponse.json({error},{status,headers:AUTH_HEADERS});
export async function GET(req:NextRequest){
 if(!participantAuthEnabled())return err("not_available",404);
 const token=req.cookies.get(PARTICIPANT_COOKIE)?.value;
 if(!token||!/^[a-f0-9]{64}$/i.test(token))return err("unauthorized",401);
 const id=Number(req.nextUrl.searchParams.get("matchId")||"1");
 const hs=Number(req.nextUrl.searchParams.get("home")||"0");
 const as=Number(req.nextUrl.searchParams.get("away")||"0");
 if(!Number.isSafeInteger(id)||id<1||![hs,as].every(n=>Number.isInteger(n)&&n>=0&&n<=30))return err("invalid_score",400);
 try{
 const sql=participantDatabase(),hash=hashOpaqueToken(token);
 const auth=await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
 if(typeof auth[0]?.user_id!=="string")return err("unauthorized",401);
 const match=await sql`SELECT n.draft_id,n.status,n.kickoff_at,n.deadline_at,h.name AS home_team,a.name AS away_team FROM footy_sandbox.calendar_new_matches n JOIN migration_source.teams h ON h.id=n.home_team_id JOIN migration_source.teams a ON a.id=n.away_team_id WHERE n.draft_id=${id} AND n.is_deleted=false LIMIT 1`;
 if(!match.length)return err("not_found",404);
 const preds=await sql`SELECT p.username,d.home_pred,d.away_pred FROM footy_sandbox.new_match_prediction_drafts d JOIN migration_source.profiles p ON p.id=d.user_id WHERE d.draft_id=${id} ORDER BY p.username`;
 const sign=(n:number)=>Math.sign(n);
 const outcome=preds.filter(p=>sign(Number(p.home_pred)-Number(p.away_pred))===sign(hs-as)).length;
 const diff=preds.filter(p=>Number(p.home_pred)-Number(p.away_pred)===hs-as).length;
 const mult=(n:number)=>n===1?1.75:n===2?1.5:n===3?1.25:1;
 const rows=preds.map(p=>{const h=Number(p.home_pred),a=Number(p.away_pred);
 const points_outcome=sign(h-a)===sign(hs-as)?2*mult(outcome):0;
 const points_diff=h-a===hs-as?mult(diff):0;
 const points_h1=h===hs?0.5:0,points_h2=a===as?0.5:0;
 const points_bonus=Math.abs(h-hs)+Math.abs(a-as)===1?0.5:0;
 return {username:p.username,home_pred:h,away_pred:a,points_outcome,points_diff,points_h1,points_h2,points_bonus,points:Number((points_outcome+points_diff+points_h1+points_h2+points_bonus).toFixed(2))};
 });
 return NextResponse.json({match:match[0],simulated_result:{home:hs,away:as},rows,simulationOnly:true,ratingUnchanged:true},{headers:AUTH_HEADERS});
 }catch{return err("data_unavailable",503);}
}