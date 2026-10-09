import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

// Read-only schedule from synthetic Neon data. Production Supabase is never queried.
export async function GET() {
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test")
    return NextResponse.json({ ok: false }, { status: 404, headers });
  if (!process.env.DATABASE_URL)
    return NextResponse.json({ ok: false, error: "test_database_not_configured" }, { status: 503, headers });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const stages = await sql`
      SELECT id, name, status, is_current, matches_required
      FROM public.stages ORDER BY id ASC LIMIT 50
    `;
    const tours = await sql`
      SELECT id, stage_id, tour_no, name FROM public.tours
      ORDER BY stage_id ASC, id ASC LIMIT 200
    `;
    const matches = await sql`
      SELECT m.id, m.stage_id, m.tour_id, m.kickoff_at, m.deadline_at, m.status,
        m.home_score, m.away_score, h.name AS home_team, a.name AS away_team
      FROM public.matches m
      LEFT JOIN public.teams h ON h.id = m.home_team_id
      LEFT JOIN public.teams a ON a.id = m.away_team_id
      ORDER BY m.kickoff_at ASC NULLS LAST, m.id ASC LIMIT 500
    `;
    return NextResponse.json({ ok: true, environment: "isolated-test", stages, tours, matches }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "test_database_unavailable" }, { status: 503, headers });
  }
}
