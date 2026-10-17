import {NextRequest,NextResponse} from "next/server";
import {AUTH_HEADERS,participantDatabase,participantOriginAllowed} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:AUTH_HEADERS});
const valid=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
const score=(v:unknown)=>typeof v==="number"&&Number.isInteger(v)&&v>=0&&v<=30;
export async function GET(req:NextRequest){
 if(!testAdminEnabled())return reply({error:"not_available"},404);
 try{
  if(!await requireTestAdmin(req))return reply({error:"forbidden"},403);
  const sql=participantDatabase();
  const matches=await sql`SELECT n.draft_id::text AS id,h.name AS home_team,a.name AS away_team,s.name AS stage_name,t.name AS tour_name,n.kickoff_at,n.is_deleted,r.home_score,r.away_score
    FROM footy_sandbox.calendar_new_matches n
    JOIN migration_source.teams h ON h.id=n.home_team_id JOIN migration_source.teams a ON a.id=n.away_team_id
    LEFT JOIN footy_sandbox.stage_drafts s ON s.draft_id=n.draft_stage_id
    LEFT JOIN footy_sandbox.tour_drafts t ON t.draft_id=n.draft_tour_id
    LEFT JOIN footy_sandbox.new_match_result_simulations r ON r.draft_id=n.draft_id
    WHERE n.draft_stage_id IS NOT NULL ORDER BY n.draft_id DESC LIMIT 100`;
  const scores=await sql`SELECT v.draft_id::text AS match_id,p.username,v.home_pred,v.away_pred,v.home_score,v.away_score,v.points_outcome,v.points_diff,v.points_h1,v.points_h2,v.points_bonus,
   (v.points_outcome+v.points_diff+v.points_h1+v.points_h2+v.points_bonus)::numeric(8,2) AS total
   FROM footy_sandbox.new_match_simulated_scores_v1 v JOIN migration_source.profiles p ON p.id=v.user_id ORDER BY v.draft_id DESC,p.username`;
  const ratings=await sql`WITH original AS (
    SELECT user_id,COALESCE(SUM(points),0)::numeric AS points FROM migration_source.points_ledger GROUP BY user_id
   ), imported_test AS (
    SELECT user_id,COALESCE(SUM(points),0)::numeric AS points FROM footy_sandbox.score_with_overrides_v1 GROUP BY user_id
   ), new_test AS (
    SELECT user_id,COALESCE(SUM(points_outcome+points_diff+points_h1+points_h2+points_bonus),0)::numeric AS points
    FROM footy_sandbox.new_match_simulated_scores_v1 GROUP BY user_id
   )
   SELECT p.username,COALESCE(o.points,0)::numeric(12,2)::text AS original_points,
    COALESCE(i.points,0)::numeric(12,2)::text AS imported_test_points,
    COALESCE(n.points,0)::numeric(12,2)::text AS new_match_points,
    (COALESCE(i.points,0)+COALESCE(n.points,0))::numeric(12,2)::text AS total_test_points,
    (COALESCE(i.points,0)+COALESCE(n.points,0)-COALESCE(o.points,0))::numeric(12,2)::text AS delta
   FROM migration_source.profiles p LEFT JOIN original o ON o.user_id=p.id
   LEFT JOIN imported_test i ON i.user_id=p.id LEFT JOIN new_test n ON n.user_id=p.id
   WHERE p.role='user' AND p.username IS NOT NULL
   ORDER BY (COALESCE(i.points,0)+COALESCE(n.points,0)) DESC,p.username`;
  return reply({matches,scores,ratings,simulation:true});
 }catch{return reply({error:"data_unavailable"},503);}
}
export async function POST(req:NextRequest){
 if(!testAdminEnabled()||process.env.ENABLE_NEON_TEST_CALENDAR_WRITES!=="true")return reply({error:"writes_disabled"},404);
 if(!participantOriginAllowed(req))return reply({error:"forbidden_origin"},403);
 try{
  if(!await requireTestAdmin(req))return reply({error:"forbidden"},403);
  const b=await req.json();
  if(!valid(b?.matchId)||!score(b?.homeScore)||!score(b?.awayScore))return reply({error:"invalid_result"},400);
  const sql=participantDatabase();
  const rows=await sql`INSERT INTO footy_sandbox.new_match_result_simulations(draft_id,home_score,away_score,updated_at)
    SELECT n.draft_id,${b.homeScore},${b.awayScore},now() FROM footy_sandbox.calendar_new_matches n
    JOIN footy_sandbox.stage_drafts s ON s.draft_id=n.draft_stage_id
    WHERE n.draft_id=${b.matchId} AND NOT n.is_deleted AND s.status='draft' AND NOT s.is_deleted
    ON CONFLICT(draft_id) DO UPDATE SET home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,updated_at=now()
    RETURNING draft_id`;
  return rows.length?reply({ok:true,testOnly:true}):reply({error:"match_unavailable"},409);
 }catch{return reply({error:"data_unavailable"},503);}
}
export async function DELETE(req:NextRequest){
 if(!testAdminEnabled()||process.env.ENABLE_NEON_TEST_CALENDAR_WRITES!=="true")return reply({error:"writes_disabled"},404);
 if(!participantOriginAllowed(req))return reply({error:"forbidden_origin"},403);
 try{
  if(!await requireTestAdmin(req))return reply({error:"forbidden"},403);
  const id=Number(req.nextUrl.searchParams.get("matchId"));
  if(!valid(id))return reply({error:"invalid_match"},400);
  const sql=participantDatabase();
  await sql`DELETE FROM footy_sandbox.new_match_result_simulations WHERE draft_id=${id} AND EXISTS
   (SELECT 1 FROM footy_sandbox.calendar_new_matches n JOIN footy_sandbox.stage_drafts s ON s.draft_id=n.draft_stage_id
    WHERE n.draft_id=${id} AND s.status='draft' AND NOT s.is_deleted)`;
  return reply({ok:true,testOnly:true});
 }catch{return reply({error:"data_unavailable"},503);}
}