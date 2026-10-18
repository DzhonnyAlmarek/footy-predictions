import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: CUTOVER_HEADERS });

async function admin(req: NextRequest) {
  const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
  return identity?.role === "admin";
}

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return reply({ ok: false }, 404);
  try {
    if (!(await admin(req))) return reply({ ok: false }, 403);
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const [teams, tournaments, stages, tours, matches] = await Promise.all([
      sql`SELECT id::text, name FROM footy_cutover.teams ORDER BY name`,
      sql`SELECT id::text, name FROM footy_cutover.tournaments ORDER BY name`,
      sql`SELECT id::text, name FROM footy_cutover.stages ORDER BY id DESC`,
      sql`SELECT id::text, stage_id::text, name, tour_no FROM footy_cutover.tours ORDER BY id DESC`,
      sql`SELECT m.id::text, m.kickoff_at, m.status, m.home_score, m.away_score,
        h.name AS home_team, a.name AS away_team
        FROM footy_cutover.matches m
        JOIN footy_cutover.teams h ON h.id=m.home_team_id
        JOIN footy_cutover.teams a ON a.id=m.away_team_id
        ORDER BY m.kickoff_at DESC LIMIT 150`
    ]);
    return reply({ ok: true, teams, tournaments, stages, tours, matches });
  } catch { return reply({ ok: false, error: "unavailable" }, 503); }
}

export async function POST(req: NextRequest) {
  if (!cutoverAuthEnabled() || process.env.ENABLE_CUTOVER_ADMIN_WRITES !== "true")
    return reply({ ok: false }, 404);
  const origin = process.env.CUTOVER_AUTH_ORIGIN;
  if (!origin || !origin.startsWith("https://") || req.headers.get("origin") !== origin)
    return reply({ ok: false }, 403);
  if (Number(req.headers.get("content-length") || 0) > 2048) return reply({ ok: false }, 413);
  try {
    if (!(await admin(req))) return reply({ ok: false }, 403);
    const body = await req.json();
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    if (body?.action === "result") {
      // The legacy app recalculates the ledger via Supabase RPC functions.
      // Those functions are not yet migrated. Never mark a match finished
      // without updating the leaderboard atomically.
      return reply({ ok: false, error: "scoring_not_ready" }, 503);
    }
    if (body?.action === "create_match") {
      const home = String(body.home_team_id ?? ""), away = String(body.away_team_id ?? "");
      const tournament = String(body.tournament_id ?? "");
      const stage = String(body.stage_id ?? "");
      const tour = String(body.tour_id ?? "");
      const kickoff = typeof body.kickoff_at === "string" ? body.kickoff_at : "";
      const deadline = typeof body.deadline_at === "string" ? body.deadline_at : "";
      const dateValid = (s: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s));
      if (![home,away,tournament,stage,tour].every(s => /^[1-9][0-9]{0,17}$/.test(s)) ||
          home === away || !dateValid(kickoff) || !dateValid(deadline) ||
          Date.parse(deadline) > Date.parse(kickoff) || Date.parse(deadline) <= Date.now())
        return reply({ ok: false, error: "invalid_match" }, 400);
      const rows = await sql`
        INSERT INTO footy_cutover.matches
          (tournament_id, stage_id, tour_id, home_team_id, away_team_id, kickoff_at, deadline_at, status)
        SELECT t.id, s.id, tr.id, h.id, a.id, ${kickoff}::timestamptz, ${deadline}::timestamptz, 'scheduled'
        FROM footy_cutover.tournaments t
        JOIN footy_cutover.stages s ON s.id=${stage}::bigint
        JOIN footy_cutover.tours tr ON tr.id=${tour}::bigint AND tr.stage_id=s.id
        JOIN footy_cutover.teams h ON h.id=${home}::bigint
        JOIN footy_cutover.teams a ON a.id=${away}::bigint
        WHERE t.id=${tournament}::bigint
        RETURNING id
      `;
      return rows.length ? reply({ ok: true, match_id: String(rows[0].id) }) : reply({ ok: false, error: "invalid_references" }, 400);
    }
    return reply({ ok: false, error: "invalid_action" }, 400);
  } catch { return reply({ ok: false, error: "write_unavailable" }, 503); }
}
