import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only, same authenticated candidate database as the participant cabinet.
export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const stages = await sql`
      SELECT id::text, name FROM footy_cutover.stages WHERE is_current = true LIMIT 2
    `;
    if (stages.length !== 1) return NextResponse.json({ ok: true, stage: null, tours: [], users: [], rows: [] }, { headers: CUTOVER_HEADERS });
    const stageId = String(stages[0].id);
    const [users, tours, rows] = await Promise.all([
      sql`SELECT id::text, username FROM footy_cutover.profiles
          WHERE username IS NOT NULL AND UPPER(username) <> 'ADMIN' AND LOWER(COALESCE(role,'')) <> 'admin'
          ORDER BY username`,
      sql`SELECT id::text, COALESCE(NULLIF(name,''),'Тур ' || tour_no::text) AS name, tour_no
          FROM footy_cutover.tours WHERE stage_id = ${stageId}::bigint
          ORDER BY tour_no::integer DESC, id DESC`,
      sql`SELECT m.id::text AS match_id, m.tour_id::text, m.stage_match_no,
          m.kickoff_at, m.home_score, m.away_score,
          h.name AS home_team, a.name AS away_team,
          p.user_id::text, p.home_pred, p.away_pred, l.points,\n          l.points_h1, l.points_h2, l.points_outcome, l.points_diff, l.points_bonus,\n          l.points_outcome_base, l.points_outcome_bonus, l.points_diff_base, l.points_diff_bonus
          FROM footy_cutover.matches m
          LEFT JOIN footy_cutover.teams h ON h.id=m.home_team_id
          LEFT JOIN footy_cutover.teams a ON a.id=m.away_team_id
          LEFT JOIN footy_cutover.predictions p ON p.match_id=m.id
            AND p.user_id IN (SELECT id FROM footy_cutover.profiles
              WHERE username IS NOT NULL AND UPPER(username)<>'ADMIN' AND LOWER(COALESCE(role,''))<>'admin')
          LEFT JOIN footy_cutover.points_ledger l ON l.match_id=m.id AND l.user_id=p.user_id
          WHERE m.stage_id=${stageId}::bigint
          ORDER BY m.stage_match_no NULLS LAST,m.kickoff_at,m.id,p.user_id`
    ]);
    const previous = await sql`
      SELECT id::text, name FROM footy_cutover.stages
      WHERE status='locked' AND id < ${stageId}::bigint
      ORDER BY id DESC LIMIT 1
    `;
    const prevId = previous[0]?.id ? String(previous[0].id) : null;
    const previousTotals = prevId ? await sql`
      SELECT p.id::text AS user_id, p.username,
             COALESCE(SUM(l.points),0)::numeric AS points
      FROM footy_cutover.profiles p
      LEFT JOIN footy_cutover.points_ledger l ON l.user_id=p.id
        AND l.match_id IN (SELECT id FROM footy_cutover.matches WHERE stage_id=${prevId}::bigint)
        AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id=l.match_id)
      WHERE p.username IS NOT NULL AND UPPER(p.username)<>'ADMIN'
      GROUP BY p.id,p.username ORDER BY points DESC,p.username
    ` : [];
    const previousBoot = prevId ? await sql`
      SELECT p.id::text AS user_id, COUNT(*)::int AS exact
      FROM footy_cutover.predictions pr
      JOIN footy_cutover.profiles p ON p.id=pr.user_id
      JOIN footy_cutover.matches m ON m.id=pr.match_id
      WHERE m.stage_id=${prevId}::bigint AND m.status='finished'
        AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
        AND pr.home_pred=m.home_score AND pr.away_pred=m.away_score
        AND UPPER(p.username)<>'ADMIN'
        AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id=m.id)
      GROUP BY p.id ORDER BY exact DESC
    ` : [];
    return NextResponse.json({ ok: true, stage: stages[0], tours, users, rows,
      previous_stage: previous[0] ?? null, previous_totals: previousTotals, previous_boot: previousBoot
    }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
