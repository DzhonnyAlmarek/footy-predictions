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
        h.name AS home_team, a.name AS away_team,
        (cm.match_id IS NOT NULL) AS admin_created
        FROM footy_cutover.matches m
        LEFT JOIN cutover_auth.created_matches cm ON cm.match_id=m.id
        JOIN footy_cutover.teams h ON h.id=m.home_team_id
        JOIN footy_cutover.teams a ON a.id=m.away_team_id
        WHERE NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
        ORDER BY m.kickoff_at DESC LIMIT 150`
    ]);
    return reply({ ok: true, teams, tournaments, stages, tours, matches, writes_enabled: process.env.ENABLE_CUTOVER_ADMIN_WRITES === "true", result_writes_enabled: process.env.ENABLE_CUTOVER_RESULT_WRITES === "true" });
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
      if (process.env.ENABLE_CUTOVER_RESULT_WRITES !== "true") return reply({ ok: false, error: "result_writes_disabled" }, 404);
      const id = String(body.match_id ?? "");
      const home = body.home_score, away = body.away_score;
      if (!/^[1-9][0-9]{0,17}$/.test(id) ||
          !Number.isInteger(home) || !Number.isInteger(away) ||
          home < 0 || home > 99 || away < 0 || away > 99)
        return reply({ ok: false, error: "invalid_result" }, 400);
      // Only matches registered by the isolated create-match workflow can receive results.
      const owned = await sql`SELECT match_id FROM cutover_auth.created_matches WHERE match_id=${id}::bigint`;
      if (!owned.length) return reply({ ok: false, error: "historical_match_protected" }, 403);
      // One database transaction scores predictions and finishes the match.
      // Previously finished matches and historical ledger entries are immutable.
      const rows = await sql`
        SELECT footy_cutover.finish_new_match(
          ${id}::bigint, ${home}::integer, ${away}::integer
        ) AS finished
      `;
      return rows[0]?.finished === true
        ? reply({ ok: true, finished: true })
        : reply({ ok: false, error: "match_already_finished_or_open" }, 409);
    }
    if (body?.action === "reschedule_match") {
      // A newly created match may be rescheduled only before any predictions exist.
      // Historical matches and matches whose deadline has passed remain immutable.
      const matchId = String(body.match_id ?? "");
      const kickoff = typeof body.kickoff_at === "string" ? body.kickoff_at : "";
      const deadline = typeof body.deadline_at === "string" ? body.deadline_at : "";
      const validDate = (s: string) => /^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d+)?(?:Z|[+-]\\d\\d:\\d\\d)$/.test(s) && Number.isFinite(Date.parse(s));
      if (!/^[1-9][0-9]{0,17}$/.test(matchId) || !validDate(kickoff) ||
          !validDate(deadline) || Date.parse(deadline) <= Date.now() ||
          Date.parse(deadline) > Date.parse(kickoff))
        return reply({ ok: false, error: "invalid_schedule" }, 400);
      const rows = await sql`
        UPDATE footy_cutover.matches m
        SET kickoff_at=${kickoff}::timestamptz, deadline_at=${deadline}::timestamptz
        WHERE m.id=${matchId}::bigint AND m.status='scheduled'
          AND m.deadline_at > now()
          AND EXISTS (SELECT 1 FROM cutover_auth.created_matches cm WHERE cm.match_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.predictions p WHERE p.match_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.points_ledger l WHERE l.match_id=m.id)
        RETURNING m.id::text
      `;
      return rows.length ? reply({ ok: true, match_id: rows[0].id })
        : reply({ ok: false, error: "match_locked_or_not_found" }, 409);
    }
    if (body?.action === "create_tour") {
      const stage = String(body.stage_id ?? "");
      const tourNo = typeof body.tour_no === "string" ? body.tour_no.trim() : "";
      const tourName = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[1-9][0-9]{0,17}$/.test(stage) ||
          !/^[0-9]{1,3}$/.test(tourNo) || Number(tourNo) < 1 ||
          Number(tourNo) > 999 || (tourName.length > 160))
        return reply({ ok: false, error: "invalid_tour" }, 400);
      const rows = await sql`
        INSERT INTO footy_cutover.tours (stage_id, tour_no, name)
        SELECT s.id, ${tourNo}, ${tourName || "Тур " + tourNo}
        FROM footy_cutover.stages s
        WHERE s.id=${stage}::bigint
        ON CONFLICT (stage_id, tour_no) DO NOTHING
        RETURNING id::text
      `;
      return rows.length ? reply({ ok: true, tour_id: rows[0].id })
        : reply({ ok: false, error: "tour_exists_or_stage_missing" }, 409);
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
        WITH created AS (
        INSERT INTO footy_cutover.matches
          (tournament_id, stage_id, tour_id, home_team_id, away_team_id, kickoff_at, deadline_at, status)
        SELECT t.id, s.id, tr.id, h.id, a.id, ${kickoff}::timestamptz, ${deadline}::timestamptz, 'scheduled'
        FROM footy_cutover.tournaments t
        JOIN footy_cutover.stages s ON s.id=${stage}::bigint
        JOIN footy_cutover.tours tr ON tr.id=${tour}::bigint AND tr.stage_id=s.id
        JOIN footy_cutover.teams h ON h.id=${home}::bigint
        JOIN footy_cutover.teams a ON a.id=${away}::bigint
        WHERE t.id=${tournament}::bigint
          AND NOT EXISTS (
            SELECT 1 FROM footy_cutover.matches existing
            WHERE existing.stage_id=s.id AND existing.tournament_id IS NOT NULL
              AND existing.tournament_id<>t.id
          )
        RETURNING id
        )
        , owned AS (
          INSERT INTO cutover_auth.created_matches(match_id)
          SELECT id FROM created RETURNING match_id AS id
        ), marked AS (
          INSERT INTO cutover_auth.test_matches(match_id)
          SELECT id FROM owned
          WHERE ${process.env.CUTOVER_SHOW_TEST_MATCHES === "true"}::boolean
          ON CONFLICT DO NOTHING
          RETURNING match_id
        )
        SELECT owned.id FROM owned LEFT JOIN marked ON marked.match_id = owned.id
      `;
      return rows.length ? reply({ ok: true, match_id: String(rows[0].id) }) : reply({ ok: false, error: "invalid_references" }, 400);
    }
    return reply({ ok: false, error: "invalid_action" }, 400);
  } catch { return reply({ ok: false, error: "write_unavailable" }, 503); }
}
