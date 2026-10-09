import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

// Read-only sandbox endpoint. Neon contains synthetic test data only.
// Never expose predictions, logins, credentials or any production Supabase data.
export async function GET() {
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test") {
    return NextResponse.json({ ok: false }, { status: 404, headers });
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ ok: false, error: "test_database_not_configured" }, { status: 503, headers });
  }
  try {
    const sql = neon(url);
    const rows = await sql`
      SELECT m.id, m.kickoff_at, m.deadline_at, m.status, m.home_score, m.away_score,
             home.name AS home_team, away.name AS away_team,
             s.name AS stage_name, t.name AS tour_name
        FROM public.matches AS m
        LEFT JOIN public.teams AS home ON home.id = m.home_team_id
        LEFT JOIN public.teams AS away ON away.id = m.away_team_id
        LEFT JOIN public.stages AS s ON s.id = m.stage_id
        LEFT JOIN public.tours AS t ON t.id = m.tour_id
       ORDER BY m.kickoff_at ASC NULLS LAST, m.id ASC
       LIMIT 20
    `;
    return NextResponse.json({ ok: true, environment: "isolated-test", count: rows.length, matches: rows }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "test_database_unavailable" }, { status: 503, headers });
  }
}
