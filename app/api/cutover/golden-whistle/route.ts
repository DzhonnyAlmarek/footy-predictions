import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";
import { basePredictionPoints, goldenWhistlePoints } from "@/lib/golden-whistle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchRow = { id: string; home_team: string; away_team: string; home_score: number; away_score: number; home_penalty_goals: number; away_penalty_goals: number };
type PredictionRow = { match_id: string; user_id: string; home_pred: number; away_pred: number; actual_points: string };

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    // Default awards view is strictly the current stage. Historical lookup is used
    // only for showing an earned title from the previous completed stage.
    const previousStageId = req.nextUrl.searchParams.get("stageId");
    if (previousStageId !== null && !/^[1-9]\d{0,14}$/.test(previousStageId)) {
      return NextResponse.json({ ok: false }, { status: 400, headers: CUTOVER_HEADERS });
    }
    const stages = previousStageId
      ? await sql`SELECT id, name, status FROM footy_cutover.stages WHERE id=${previousStageId}::bigint AND status='locked' LIMIT 1`
      : await sql`SELECT id, name, status FROM footy_cutover.stages WHERE is_current = true LIMIT 2`;
    if (stages.length !== 1) return NextResponse.json({ ok: true, stage: null, available_stages: [], penalty_matches: 0, leaderboard: [] }, { headers: CUTOVER_HEADERS });
    const stage = stages[0];
    const availableStages = await sql`SELECT id::text AS id, name, status FROM footy_cutover.stages WHERE is_current = true`;
    const matches = await sql`
      SELECT m.id, h.name AS home_team, a.name AS away_team, m.home_score, m.away_score, m.home_penalty_goals, m.away_penalty_goals
      FROM footy_cutover.matches m
      LEFT JOIN footy_cutover.teams h ON h.id=m.home_team_id
      LEFT JOIN footy_cutover.teams a ON a.id=m.away_team_id
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
    const breakdown = new Map<string, {match_id:string;match:string;result:string;without_penalties:string;prediction:string;points:number;with_penalties_base:number;without_penalties_base:number;actual_points:number}[]>();
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
      if (earned > 0) breakdown.set(uid,[...(breakdown.get(uid)??[]),{
        match_id:String(match.id),match:`${match.home_team} — ${match.away_team}`,
        result:`${match.home_score}:${match.away_score}`,
        without_penalties:`${match.home_score-match.home_penalty_goals}:${match.away_score-match.away_penalty_goals}`,
        prediction:`${record.home_pred}:${record.away_pred}`,points:earned,
        with_penalties_base:withPens,without_penalties_base:withoutPens,actual_points:Number(record.actual_points)
      }]);
    }
    const mainRanking = [...profiles].sort((a, b) =>
      (mainTotals.get(String(b.id)) ?? 0) - (mainTotals.get(String(a.id)) ?? 0) ||
      String(a.username).localeCompare(String(b.username), "ru"));
    const mainPlaces = new Map(mainRanking.map((p, index) => [String(p.id), index + 1]));
    const leaderboard = profiles.map(p => ({
      username: p.username, points: whistleTotals.get(String(p.id)) ?? 0,
      main_points: mainTotals.get(String(p.id)) ?? 0,
      main_place: mainPlaces.get(String(p.id)) ?? profiles.length,
      breakdown: breakdown.get(String(p.id)) ?? []
    })).sort((a, b) => b.points - a.points || b.main_place - a.main_place || String(a.username).localeCompare(String(b.username), "ru"));
    return NextResponse.json({ ok: true, stage, available_stages: availableStages, penalty_matches: matches.filter(m =>
      Number(m.home_penalty_goals) + Number(m.away_penalty_goals) > 0).length, leaderboard }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
