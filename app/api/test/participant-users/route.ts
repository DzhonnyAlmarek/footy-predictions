import { NextResponse } from "next/server";
import { participantDatabase, participantAuthEnabled, AUTH_HEADERS } from "@/lib/neon-participant-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!participantAuthEnabled()) return NextResponse.json({ok:false}, {status:404,headers:AUTH_HEADERS});
  try {
    const sql = participantDatabase();
    const rows = await sql`SELECT DISTINCT p.username FROM migration_source.profiles p JOIN test_auth.participant_credentials c ON c.user_id=p.id WHERE c.enabled=true AND p.username IS NOT NULL ORDER BY p.username`;
    return NextResponse.json({ok:true,users:rows.map(row=>row.username)}, {headers:AUTH_HEADERS});
  } catch { return NextResponse.json({ok:false}, {status:503,headers:AUTH_HEADERS}); }
}
