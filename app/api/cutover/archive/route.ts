import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 if(!cutoverAuthEnabled()) return NextResponse.json({ok:false},{status:404,headers:CUTOVER_HEADERS});
 try {
  const identity=await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
  if(!identity) return NextResponse.json({ok:false},{status:401,headers:CUTOVER_HEADERS});
  const sql=neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
  const stages=await sql`SELECT id::text,name FROM footy_cutover.stages WHERE status='locked' ORDER BY id DESC`;
  const requested=req.nextUrl.searchParams.get("stageId");
  if(requested!==null && !/^[1-9]\d{0,14}$/.test(requested)) return NextResponse.json({ok:false},{status:400,headers:CUTOVER_HEADERS});
  const stage=stages.find(s=>String(s.id)===(requested??String(stages[0]?.id)))??null;
  if(!stage) return NextResponse.json({ok:true,stages,stage:null,tours:[],users:[],rows:[]},{headers:CUTOVER_HEADERS});
  const id=String(stage.id);
  const [tours,users,rows]=await Promise.all([
   sql`SELECT id::text,name,tour_no FROM footy_cutover.tours WHERE stage_id=${id}::bigint ORDER BY tour_no::integer DESC`,
   sql`SELECT id::text,username FROM footy_cutover.profiles WHERE username IS NOT NULL AND UPPER(username)<>'ADMIN' AND LOWER(COALESCE(role,''))<>'admin' ORDER BY username`,
   sql`SELECT m.id::text match_id,m.tour_id::text,m.stage_match_no,m.home_score,m.away_score,
   h.name home_team,a.name away_team,p.user_id::text,p.home_pred,p.away_pred,l.points
   FROM footy_cutover.matches m JOIN footy_cutover.teams h ON h.id=m.home_team_id
   JOIN footy_cutover.teams a ON a.id=m.away_team_id
   LEFT JOIN footy_cutover.predictions p ON p.match_id=m.id
   LEFT JOIN footy_cutover.points_ledger l ON l.match_id=m.id AND l.user_id=p.user_id
   WHERE m.stage_id=${id}::bigint AND NOT EXISTS(SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id=m.id)
   ORDER BY m.stage_match_no,m.id,p.user_id`
  ]);
  return NextResponse.json({ok:true,stages,stage,tours,users,rows},{headers:CUTOVER_HEADERS});
 }catch{return NextResponse.json({ok:false,error:"unavailable"},{status:503,headers:CUTOVER_HEADERS});}
}
