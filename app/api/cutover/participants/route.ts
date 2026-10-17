import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { cutoverAuthEnabled, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!cutoverAuthEnabled()) {
    return NextResponse.json({ participants: [] }, { status: 404, headers: CUTOVER_HEADERS });
  }
  try {
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const rows = await sql`
      SELECT username FROM footy_cutover.profiles
      WHERE username IS NOT NULL AND btrim(username) <> ''
      ORDER BY CASE WHEN username = 'ADMIN' THEN 0 ELSE 1 END, username
    `;
    return NextResponse.json({
      participants: rows.map(row => row.username).filter((value): value is string => typeof value === "string")
    }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ participants: [] }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
