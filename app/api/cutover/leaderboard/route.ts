import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const leaderboard = await sql`
      SELECT p.username, COALESCE(SUM(l.points),0)::numeric AS points,
        COUNT(l.id)::int AS scored_predictions
      FROM footy_cutover.profiles p
      LEFT JOIN footy_cutover.points_ledger l ON l.user_id=p.id
      WHERE p.username IS NOT NULL
      GROUP BY p.id,p.username
      ORDER BY points DESC, scored_predictions DESC, p.username
    `;
    return NextResponse.json({ ok: true, leaderboard }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
