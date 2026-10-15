import { NextRequest,NextResponse } from "next/server";
import {AUTH_HEADERS,participantDatabase} from "@/lib/neon-participant-server";
import {requireTestAdmin,testAdminEnabled} from "@/lib/test-neon-admin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest) {
 if(!testAdminEnabled()) return NextResponse.json({error:"not_available"},{status:404,headers:AUTH_HEADERS});
 try {
  if(!await requireTestAdmin(req)) return NextResponse.json({error:"forbidden"},{status:403,headers:AUTH_HEADERS});
  const sql=participantDatabase();
  const rows=await sql`
   WITH original AS (SELECT user_id,sum(points) total FROM migration_source.points_ledger GROUP BY user_id),
   simulated AS (SELECT user_id,sum(points) total FROM footy_sandbox.score_with_overrides_v1 GROUP BY user_id)
   SELECT p.username,coalesce(o.total,0)::numeric(12,2)::text AS original_points,
    coalesce(s.total,0)::numeric(12,2)::text AS preview_points,
    (coalesce(s.total,0)-coalesce(o.total,0))::numeric(12,2)::text AS delta
   FROM simulated s JOIN migration_source.profiles p ON p.id=s.user_id
   LEFT JOIN original o ON o.user_id=s.user_id ORDER BY s.total DESC,p.username
  `;
  const count=await sql`SELECT count(*)::int AS total FROM footy_sandbox.match_result_overrides`;
  const changed=await sql`SELECT match_id::text AS id,home_score,away_score FROM footy_sandbox.match_result_overrides ORDER BY match_id`;
  return NextResponse.json({readonly:true,overrides:count[0]?.total??0,changedMatchIds:changed.map(x=>x.id),changedMatches:changed,ratings:rows},{headers:AUTH_HEADERS});
 } catch {return NextResponse.json({error:"data_unavailable"},{status:503,headers:AUTH_HEADERS});}
}
