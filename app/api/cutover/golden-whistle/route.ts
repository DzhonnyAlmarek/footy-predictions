import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";
import { basePredictionPoints, goldenWhistlePoints } from "@/lib/golden-whistle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchRow = { id: string; home_score: number; away_score: number; home_penalty_goals: number; away_penalty_goals: number };
type PredictionRow = { match_id: string; user_id: string; home_pred: number; away_pred: number; actual_points: string };

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const requestedStage = req.nextUrl.searchParams.get("stageId");
    if (requestedStage !== null && !/^[1-9]\d{0,14}$/.test(requestedStage)) {
      return NextResponse.json({ ok: false, error: "invalid stage" }, { status: 400, headers: CUTOVER_HEADERS });
    }
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const stages = requestedStage
      ? await sql`SELECT id, name, status FROM footy_cutover.stages WHERE id = ${requestedStage}::bigint AND (is_current OR status = 'locked') LIMIT 1`
      : await sql`SELECT id, name, status FROM footy_cutover.stages WHERE is_current = true LIMIT 1`;
    if (!stages.length) return NextResponse.json({ ok: false, error: "stage not found" }, { status: 404, headers: CUTOVER_HEADERS });
    const stage = stages[0];
    const matches = await sql`
      SELECT id, home_score, away_score, home_penalty_goals, away_penalty_goals
      FROM footy_cutover.matches m
      WHERE stage_id = ${stage.id}::bigint AND status = 'finished'
        AND home_score IS NOT NULL AND away_score IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id = m.id)
    ` as MatchRow[];
    const profiles = await sql`
      SELECT id::text AS id, username FROM footy_cutover.profiles
      WHERE username IS NOT NULL AND upper(username) <> 'ADMIN'
      ORDER BY username
    `;
    const records = await sql`
      SELECT p.match_id::text AS match_id, p.user_id::text AS user_id, p.home_pred, p.away_pred,
        l.points::text AS actual_points
      FROM footy_cutover.predictions p
      JOIN footy_cutover.matches m ON m.id = p.match_id
      JOIN footy_cutover.points_ledger l ON l.match_id=p.match_id AND l.user_id=p.user_id
      WHERE m.stage_id = ${stage.id}::bigint AND m.status='finished'
        AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches t WHERE t.match_id=m.id)
    ` as PredictionRow[];
    const matchById = new Map(matches.map(m => [String(m.id), m]));
    const mainTotals = new Map<string, number>();
    const whistleTotals = new Map<string, number>();
    for (const record of records) {
      const uid = String(record.user_id);
      mainTotals.set(uid, (mainTotals.get(uid) ?? 0) + Number(record.actual_points));
      const match = matchById.get(String(record.match_id));
      if (!match || !(Number(match.home_penalty_goals) + Number(match.away_penalty_goals))) continue;
      const withPens = basePredictionPoints(record.home_pred, record.away_pred, match.home_score, match.away_score);
      const withoutPens = basePredictionPoints(record.home_pred, record.away_pred,
        match.home_score - match.home_penalty_goals, match.away_score - match.away_penalty_goals);
      const earned = goldenWhistlePoints(Number(record.actual_points), withPens, withoutPens);
      whistleTotals.set(uid, Math.round(((whistleTotals.get(uid) ?? 0) + earned) * 100) / 100);
    }
    const mainRanking = [...profiles].sort((a, b) =>
      (mainTotals.get(String(b.id)) ?? 0) - (mainTotals.get(String(a.id)) ?? 0) ||
      String(a.username).localeCompare(String(b.username), "ru"));
    const mainPlaces = new Map(mainRanking.map((p, index) => [String(p.id), index + 1]));
    const leaderboard = profiles.map(p => ({
      username: p.username, points: whistleTotals.get(String(p.id)) ?? 0,
      main_points: mainTotals.get(String(p.id)) ?? 0,
      main_place: mainPlaces.get(String(p.id)) ?? profiles.length
    })).sort((a, b) => b.points - a.points || a.main_place - b.main_place || String(a.username).localeCompare(String(b.username), "ru"));
    return NextResponse.json({ ok: true, stage, penalty_matches: matches.filter(m =>
      Number(m.home_penalty_goals) + Number(m.away_penalty_goals) > 0).length, leaderboard }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
