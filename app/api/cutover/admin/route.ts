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
    const requestedStage = req.nextUrl.searchParams.get("stage_id");
    if (requestedStage !== null && !/^[1-9][0-9]{0,17}$/.test(requestedStage))
      return reply({ ok: false, error: "invalid_stage_id" }, 400);
    const [teams, tournaments, stages, tours, matches, delegatedPredictions] = await Promise.all([
      sql`SELECT id::text, name FROM footy_cutover.teams ORDER BY name`,
      sql`SELECT id::text, name FROM footy_cutover.tournaments ORDER BY name`,
      sql`SELECT s.id::text, s.name, s.status, s.is_current, s.matches_required,
        (SELECT COUNT(*)::int FROM footy_cutover.matches m WHERE m.stage_id=s.id
          AND NOT EXISTS(SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)) AS match_count,
        (SELECT COUNT(*)::int FROM footy_cutover.matches m WHERE m.stage_id=s.id
          AND m.status='finished' AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)) AS finished_count
        FROM footy_cutover.stages s ORDER BY s.id DESC`,
      sql`SELECT id::text, stage_id::text, name, tour_no FROM footy_cutover.tours ORDER BY id DESC`,
      sql`SELECT m.id::text, m.tour_id::text, m.kickoff_at, m.deadline_at, m.status, m.home_score, m.away_score, m.home_penalty_goals, m.away_penalty_goals,
        m.home_team_id::text, m.away_team_id::text,
        h.name AS home_team, a.name AS away_team,
        (cm.match_id IS NOT NULL) AS admin_created,
        (m.status='scheduled' AND m.kickoff_at<=now() AND m.deadline_at<=now()
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.points_ledger l WHERE l.match_id=m.id)
          AND (cm.match_id IS NOT NULL OR EXISTS (
            SELECT 1 FROM cutover_auth.result_write_allowlist a WHERE a.match_id=m.id
          ))) AS result_eligible
        FROM footy_cutover.matches m
        LEFT JOIN cutover_auth.created_matches cm ON cm.match_id=m.id
        JOIN footy_cutover.teams h ON h.id=m.home_team_id
        JOIN footy_cutover.teams a ON a.id=m.away_team_id
        WHERE NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
          AND m.stage_id = COALESCE(${requestedStage}::bigint,
            (SELECT s.id FROM footy_cutover.stages s WHERE s.is_current=true))
        ORDER BY m.kickoff_at, m.id`,
      sql`SELECT p.match_id::text, u.username
        FROM footy_cutover.predictions p
        JOIN footy_cutover.profiles u ON u.id=p.user_id AND u.role <> 'admin'
        JOIN footy_cutover.matches m ON m.id=p.match_id
        WHERE m.stage_id = COALESCE(${requestedStage}::bigint,
          (SELECT s.id FROM footy_cutover.stages s WHERE s.is_current=true))
          AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
        ORDER BY p.match_id, u.username`
    ]);
    return reply({ ok: true, teams, tournaments, stages, tours, matches, delegated_predictions: delegatedPredictions, prediction_writes_enabled: process.env.ENABLE_CUTOVER_PREDICTION_WRITES === "true", writes_enabled: process.env.ENABLE_CUTOVER_ADMIN_WRITES === "true", result_writes_enabled: process.env.ENABLE_CUTOVER_RESULT_WRITES === "true" });
  } catch { return reply({ ok: false, error: "unavailable" }, 503); }
}

export async function POST(req: NextRequest) {
  if (!cutoverAuthEnabled() || process.env.ENABLE_CUTOVER_ADMIN_WRITES !== "true")
    return reply({ ok: false }, 404);
  const origin = process.env.CUTOVER_AUTH_ORIGIN;
  // The Yandex HTTPS endpoint and the club's HTTPS domain share the same
  // authenticated deployment. Mirror the login endpoint's origin allowlist.
  const customOrigin = process.env.DEPLOY_TARGET === "yandex-neon-production-candidate"
    ? "https://www.murashevclub.ru" : null;
  const allowedOrigins = [origin, customOrigin].filter(
    (value): value is string => typeof value === "string" && value.startsWith("https://")
  );
  if (!origin || !origin.startsWith("https://") ||
      !req.headers.get("origin") || !allowedOrigins.includes(req.headers.get("origin")!))
    return reply({ ok: false }, 403);
  if (Number(req.headers.get("content-length") || 0) > 2048) return reply({ ok: false }, 413);
  try {
    const actor = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (actor?.role !== "admin") return reply({ ok: false }, 403);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 2048) return reply({ ok: false, error: "payload_too_large" }, 413);
    const body = JSON.parse(rawBody);
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    if (body?.action === "create_stage") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 160 || /[<>]/.test(name))
        return reply({ ok: false, error: "invalid_stage_name" }, 400);
      // Always create an empty draft; the active stage is never changed here.
      const rows = await sql`
        INSERT INTO footy_cutover.stages (id, name, status, matches_required, is_current)
        SELECT GREATEST(nextval('footy_cutover.stages_id_seq'),
          (SELECT COALESCE(MAX(id),0) + 1 FROM footy_cutover.stages)), ${name}, 'draft', 56, false
        WHERE NOT EXISTS (
          SELECT 1 FROM footy_cutover.stages s WHERE lower(s.name)=lower(${name})
        )
        RETURNING id::text, name
      `;
      return rows.length ? reply({ ok: true, stage: rows[0] })
        : reply({ ok: false, error: "stage_name_exists" }, 409);
    }
    if (body?.action === "save_for_participant") {
      if (process.env.ENABLE_CUTOVER_PREDICTION_WRITES !== "true")
        return reply({ ok: false, error: "prediction_writes_disabled" }, 404);
      const matchId = String(body.match_id ?? "");
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const note = typeof body.source_note === "string" ? body.source_note.trim() : "";
      const home = body.home_pred, away = body.away_pred;
      if (!/^[1-9][0-9]{0,17}$/.test(matchId) || !username || username.length > 100 ||
          !note || note.length < 3 || note.length > 160 ||
          !Number.isInteger(home) || !Number.isInteger(away) ||
          home < 0 || home > 99 || away < 0 || away > 99)
        return reply({ ok: false, error: "invalid_delegated_prediction" }, 400);
      // This statement is atomic: writing a prediction requires an audit entry.
      // If the audit prerequisite is absent or a deadline has passed, fail closed.
      const recorded = await sql`
        WITH eligible AS (
          SELECT m.id AS match_id, p.id AS participant_id,
                 old.id AS previous_id,
                 old.home_pred AS previous_home_pred, old.away_pred AS previous_away_pred
          FROM footy_cutover.matches m
          JOIN footy_cutover.stages s ON s.id=m.stage_id AND s.is_current=true
          JOIN footy_cutover.profiles p ON p.username=${username} AND p.role <> 'admin'
          LEFT JOIN footy_cutover.predictions old ON old.match_id=m.id AND old.user_id=p.id
          WHERE m.id=${matchId}::bigint AND m.status='scheduled'
            AND m.deadline_at > now() AND m.kickoff_at > now()
            AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
            AND NOT EXISTS (SELECT 1 FROM footy_cutover.points_ledger l WHERE l.match_id=m.id)
        ),
        written AS (
          INSERT INTO footy_cutover.predictions (id, match_id, user_id, home_pred, away_pred)
          SELECT nextval('footy_cutover.predictions_id_seq'), e.match_id, e.participant_id,
                 ${home}::integer, ${away}::integer FROM eligible e WHERE true
          ON CONFLICT (match_id, user_id) DO UPDATE SET
            home_pred=EXCLUDED.home_pred, away_pred=EXCLUDED.away_pred, updated_at=now()
          WHERE EXISTS (
            SELECT 1 FROM footy_cutover.matches m
            JOIN footy_cutover.stages s ON s.id=m.stage_id AND s.is_current=true
            WHERE m.id=EXCLUDED.match_id AND m.status='scheduled'
              AND m.deadline_at>now() AND m.kickoff_at>now()
              AND NOT EXISTS (SELECT 1 FROM footy_cutover.points_ledger l WHERE l.match_id=m.id)
          )
          RETURNING id, match_id, user_id, home_pred, away_pred
        ),
        audit AS (
          INSERT INTO cutover_auth.admin_prediction_audit
            (prediction_id, match_id, participant_id, actor_id, previous_home_pred,
             previous_away_pred, home_pred, away_pred, source_note)
          SELECT w.id, w.match_id, w.user_id, ${actor.userId}::uuid, e.previous_home_pred,
                 e.previous_away_pred, w.home_pred, w.away_pred, ${note}
          FROM written w JOIN eligible e
            ON e.match_id=w.match_id AND e.participant_id=w.user_id
          RETURNING id
        )
        SELECT id::text FROM audit
      `;
      return recorded.length === 1 ? reply({ok:true,recorded:true})
        : reply({ok:false,error:"match_closed_or_participant_missing"},409);
    }
    if (body?.action === "close_stage") {
      const currentId = String(body.stage_id ?? "");
      const nextId = String(body.next_stage_id ?? "");
      if (!/^[1-9][0-9]{0,17}$/.test(currentId) || !/^[1-9][0-9]{0,17}$/.test(nextId) || currentId === nextId)
        return reply({ok:false,error:"invalid_stage_ids"},400);
      // The installed database function performs all checks and both updates in
      // a single PostgreSQL transaction, with a transaction advisory lock.
      // Without the reviewed migration, this call fails closed (503).
      const changed = await sql`SELECT closed_stage_id::text, activated_stage_id::text
        FROM footy_cutover.close_stage_and_activate_next(${currentId}::bigint,${nextId}::bigint)`;
      return changed.length === 1 ? reply({ok:true, ...changed[0]})
        : reply({ok:false,error:"stage_transition_failed"},409);
    }
    if (body?.action === "result") {
      if (process.env.ENABLE_CUTOVER_RESULT_WRITES !== "true") return reply({ ok: false, error: "result_writes_disabled" }, 404);
      const id = String(body.match_id ?? "");
      const home = body.home_score, away = body.away_score;
      const homePenalty = body.home_penalty_goals, awayPenalty = body.away_penalty_goals;
      if (!/^[1-9][0-9]{0,17}$/.test(id) ||
          !Number.isInteger(home) || !Number.isInteger(away) ||
          home < 0 || home > 99 || away < 0 || away > 99 ||
          !Number.isInteger(homePenalty) || !Number.isInteger(awayPenalty) ||
          homePenalty < 0 || awayPenalty < 0 || homePenalty > home || awayPenalty > away)
        return reply({ ok: false, error: "invalid_result" }, 400);
      // Imported fixtures require an explicit per-match authorization recorded
      // in cutover_auth.result_write_allowlist; completed historical data stays protected.
      const owned = await sql`
        SELECT m.id FROM footy_cutover.matches m
        WHERE m.id=${id}::bigint
          AND (
            EXISTS (SELECT 1 FROM cutover_auth.created_matches cm WHERE cm.match_id=m.id)
            OR EXISTS (SELECT 1 FROM cutover_auth.result_write_allowlist a WHERE a.match_id=m.id)
          )
          AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
      `;
      if (!owned.length) return reply({ ok: false, error: "historical_match_protected" }, 403);
      // Fail closed before invoking the scoring routine. An admin-created fixture
      // must be scheduled, have passed its prediction deadline, and have no
      // existing ledger rows. The database routine remains the atomic authority
      // for finishing/scoring; these checks only narrow eligibility.
      const eligible = await sql`
        SELECT m.id FROM footy_cutover.matches m
        WHERE m.id=${id}::bigint AND m.status='scheduled'
          AND m.deadline_at <= now()
          AND NOT EXISTS (
            SELECT 1 FROM footy_cutover.points_ledger l WHERE l.match_id=m.id
          )
          AND (
            EXISTS (SELECT 1 FROM cutover_auth.created_matches cm WHERE cm.match_id=m.id)
            OR EXISTS (SELECT 1 FROM cutover_auth.result_write_allowlist a WHERE a.match_id=m.id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id
          )
      `;
      if (eligible.length !== 1)
        return reply({ ok: false, error: "match_not_ready_or_already_scored" }, 409);
      // One database transaction scores predictions and finishes the match.
      // Previously finished matches and historical ledger entries are immutable.
      const rows = await sql`
        SELECT footy_cutover.finish_new_match(
          ${id}::bigint, ${home}::integer, ${away}::integer,
          ${homePenalty}::integer, ${awayPenalty}::integer
        ) AS finished
      `;
      return rows[0]?.finished === true
        ? reply({ ok: true, finished: true })
        : reply({ ok: false, error: "match_already_finished_or_open" }, 409);
    }
    if (body?.action === "edit_match_teams") {
      const matchId = String(body.match_id ?? "");
      const home = String(body.home_team_id ?? "");
      const away = String(body.away_team_id ?? "");
      const validId = (v: string) => /^[1-9][0-9]{0,17}$/.test(v);
      if (![matchId, home, away].every(validId) || home === away)
        return reply({ ok: false, error: "invalid_teams" }, 400);
      // Allow untouched scheduled fixtures, including imported ones. Matches with
      // predictions, expired deadlines or scoring history remain immutable.
      const rows = await sql`
        UPDATE footy_cutover.matches m
        SET home_team_id=${home}::bigint, away_team_id=${away}::bigint
        WHERE m.id=${matchId}::bigint AND m.status='scheduled'
          AND m.deadline_at > now() AND m.kickoff_at > now()
          AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
          AND EXISTS (SELECT 1 FROM footy_cutover.teams h WHERE h.id=${home}::bigint)
          AND EXISTS (SELECT 1 FROM footy_cutover.teams a WHERE a.id=${away}::bigint)
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.predictions p WHERE p.match_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.points_ledger l WHERE l.match_id=m.id)
          AND NOT EXISTS (
            SELECT 1 FROM footy_cutover.matches other
            WHERE other.id<>m.id AND other.tour_id=m.tour_id AND other.status='scheduled'
              AND (other.home_team_id IN (${home}::bigint, ${away}::bigint)
                OR other.away_team_id IN (${home}::bigint, ${away}::bigint))
          )
        RETURNING m.id::text
      `;
      return rows.length ? reply({ ok: true, match_id: rows[0].id })
        : reply({ ok: false, error: "match_locked_or_not_found" }, 409);
    }
    if (body?.action === "reschedule_match") {
      // Only untouched scheduled fixtures (including imported) may be rescheduled.
      // Historical matches and matches whose deadline has passed remain immutable.
      const matchId = String(body.match_id ?? "");
      const kickoff = typeof body.kickoff_at === "string" ? body.kickoff_at : "";
      const deadline = typeof body.deadline_at === "string" ? body.deadline_at : "";
      const validDate = (s: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s));
      if (!/^[1-9][0-9]{0,17}$/.test(matchId) || !validDate(kickoff) ||
          !validDate(deadline) || Date.parse(deadline) <= Date.now() ||
          Date.parse(deadline) > Date.parse(kickoff))
        return reply({ ok: false, error: "invalid_schedule" }, 400);
      const rows = await sql`
        UPDATE footy_cutover.matches m
        SET kickoff_at=${kickoff}::timestamptz, deadline_at=${deadline}::timestamptz
        WHERE m.id=${matchId}::bigint AND m.status='scheduled'
          AND m.deadline_at > now() AND m.kickoff_at > now()
          AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches tm WHERE tm.match_id=m.id)
          AND ${deadline}::timestamptz > now()
          AND ${deadline}::timestamptz <= ${kickoff}::timestamptz
          AND (SELECT COUNT(*) FROM footy_cutover.matches existing WHERE existing.stage_id=s.id)
            < s.matches_required
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.predictions p WHERE p.match_id=m.id)
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.points_ledger l WHERE l.match_id=m.id)
        RETURNING m.id::text
      `;
      return rows.length ? reply({ ok: true, match_id: rows[0].id })
        : reply({ ok: false, error: "match_locked_or_not_found" }, 409);
    }
    if (body?.action === "rename_stage") {
      const stageId = String(body.stage_id ?? "");
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[1-9][0-9]{0,17}$/.test(stageId) || !name || name.length > 160)
        return reply({ ok: false, error: "invalid_stage" }, 400);
      // Only an empty draft stage can be renamed. Historical stage names stay immutable.
      const rows = await sql`
        UPDATE footy_cutover.stages s SET name=${name}
        WHERE s.id=${stageId}::bigint AND s.status='draft'
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.tours t WHERE t.stage_id=s.id)
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.matches m WHERE m.stage_id=s.id)
        RETURNING s.id::text
      `;
      return rows.length ? reply({ ok: true, stage_id: rows[0].id })
        : reply({ ok: false, error: "stage_locked_or_not_found" }, 409);
    }
    if (body?.action === "rename_tour") {
      const tourId = String(body.tour_id ?? "");
      const tourName = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[1-9][0-9]{0,17}$/.test(tourId) || !tourName || tourName.length > 160)
        return reply({ ok: false, error: "invalid_tour" }, 400);
      // Renaming the display label does not change predictions, deadlines or scoring.
      const rows = await sql`
        UPDATE footy_cutover.tours t SET name=${tourName}
        WHERE t.id=${tourId}::bigint
          AND NOT EXISTS (SELECT 1 FROM footy_cutover.matches m WHERE m.tour_id=t.id)
        RETURNING t.id::text
      `;
      return rows.length ? reply({ ok: true, tour_id: rows[0].id })
        : reply({ ok: false, error: "tour_not_found" }, 404);
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
        WHERE s.id=${stage}::bigint AND s.status='draft'
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
        WHERE t.id=${tournament}::bigint AND s.status='draft'
          AND ${deadline}::timestamptz > now()
          AND ${deadline}::timestamptz <= ${kickoff}::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM footy_cutover.matches existing
            WHERE existing.stage_id=s.id AND existing.tournament_id IS NOT NULL
              AND existing.tournament_id<>t.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM footy_cutover.matches existing
            WHERE existing.tour_id=tr.id
              AND (existing.home_team_id IN (h.id,a.id)
                OR existing.away_team_id IN (h.id,a.id))
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
