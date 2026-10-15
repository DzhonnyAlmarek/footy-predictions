import { NextRequest, NextResponse } from "next/server";
import { AUTH_HEADERS, participantDatabase } from "@/lib/neon-participant-server";
import { requireTestAdmin, testAdminEnabled } from "@/lib/test-neon-admin";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Deliberately no POST, PATCH, PUT or DELETE. Preview-only admin access.
export async function GET(req: NextRequest) {
  if (!testAdminEnabled()) return NextResponse.json({error:"not_available"},{status:404,headers:AUTH_HEADERS});
  try {
    if (!(await requireTestAdmin(req))) return NextResponse.json({error:"forbidden"},{status:403,headers:AUTH_HEADERS});
    const sql=participantDatabase();
    const rows=await sql`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE has_test_override)::int AS test_changes
      FROM footy_sandbox.match_results_preview_v1`;
    return NextResponse.json({readonly:true,admin:true,overview:rows[0]}, {headers:AUTH_HEADERS});
  } catch {
    return NextResponse.json({error:"data_unavailable"},{status:503,headers:AUTH_HEADERS});
  }
}
