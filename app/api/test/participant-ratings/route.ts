import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { AUTH_HEADERS, PARTICIPANT_COOKIE, participantAuthEnabled, participantDatabase } from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!participantAuthEnabled()) return NextResponse.json({error:"not_available"},{status:404,headers:AUTH_HEADERS});
  const token = req.cookies.get(PARTICIPANT_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({error:"unauthorized"},{status:401,headers:AUTH_HEADERS});
  const scope = req.nextUrl.searchParams.get("scope") || "overall";
  if (!["overall","stages","tours"].includes(scope)) return NextResponse.json({error:"invalid_scope"},{status:400,headers:AUTH_HEADERS});
  try {
    const sql = participantDatabase();
    const hash = hashOpaqueToken(token);
    const session = await sql`SELECT test_auth.session_user(decode(${hash},'hex')) AS user_id`;
    if (typeof session[0]?.user_id !== "string") return NextResponse.json({error:"unauthorized"},{status:401,headers:AUTH_HEADERS});
    if (scope === "overall") {
      const rows = await sql`SELECT username,points,entries FROM footy_sandbox.participant_rating_v1 ORDER BY points DESC,username ASC`;
      return NextResponse.json({scope,rows},{headers:AUTH_HEADERS});
    }
    if (scope === "stages") {
      const rows = await sql`SELECT stage_id::text AS group_id,stage_name AS group_name,username,points,entries FROM footy_sandbox.stage_rating_v1 ORDER BY stage_id DESC,points DESC,username ASC LIMIT 500`;
      return NextResponse.json({scope,rows},{headers:AUTH_HEADERS});
    }
    const rows = await sql`SELECT tour_id::text AS group_id,stage_id::text AS stage_id,tour_name AS group_name,username,points,entries FROM footy_sandbox.tour_rating_v1 ORDER BY tour_id DESC,points DESC,username ASC LIMIT 500`;
    return NextResponse.json({scope,rows},{headers:AUTH_HEADERS});
  } catch {
    return NextResponse.json({error:"data_unavailable"},{status:503,headers:AUTH_HEADERS});
  }
}
