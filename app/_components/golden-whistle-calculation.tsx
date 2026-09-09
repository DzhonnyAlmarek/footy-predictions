import { createClient } from "@supabase/supabase-js";
import {
  basePredictionPoints,
  formatWhistlePoints,
  goldenWhistlePoints,
} from "@/lib/golden-whistle";

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

function teamName(team: any) {
  if (Array.isArray(team)) return String(team[0]?.name ?? "?");
  return String(team?.name ?? "?");
}

export default async function GoldenWhistleCalculation({ stageId }: { stageId: number }) {
  const sb = service();
  const [{ data: users, error: usersError }, { data: matches, error: matchesError }] =
    await Promise.all([
      sb.from("login_accounts")
        .select("login,user_id")
        .neq("login", "ADMIN")
        .order("login"),
      sb.from("matches")
        .select(`
          id,stage_match_no,home_score,away_score,home_penalty_goals,away_penalty_goals,
          home_team:teams!matches_home_team_id_fkey(name),
          away_team:teams!matches_away_team_id_fkey(name)
        `)
        .eq("stage_id", stageId)
        .eq("status", "finished")
        .order("stage_match_no", { ascending: true }),
    ]);

  if (usersError || matchesError) {
    return (
      <div className="card" style={{ marginTop: 20, color: "crimson" }}>
        Не удалось загрузить расчёт «Золотого свистка»: {usersError?.message ?? matchesError?.message}
      </div>
    );
  }

  const userRows = (users ?? []).map((user: any) => ({
    login: String(user.login),
    userId: String(user.user_id),
  }));
  const matchRows = (matches ?? []).filter((match: any) =>
    match.home_score != null &&
    match.away_score != null &&
    Number(match.home_penalty_goals ?? 0) + Number(match.away_penalty_goals ?? 0) > 0
  );
  const matchIds = matchRows.map((match: any) => Number(match.id));
  const userIds = userRows.map((user) => user.userId);

  const [{ data: predictions }, { data: ledger }] = matchIds.length && userIds.length
    ? await Promise.all([
        sb.from("predictions")
          .select("match_id,user_id,home_pred,away_pred")
          .in("match_id", matchIds)
          .in("user_id", userIds),
        sb.from("points_ledger")
          .select("match_id,user_id,points")
          .in("match_id", matchIds)
          .in("user_id", userIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  const predictionByKey = new Map(
    (predictions ?? []).map((row: any) => [`${row.match_id}:${row.user_id}`, row])
  );
  const ledgerByKey = new Map(
    (ledger ?? []).map((row: any) => [`${row.match_id}:${row.user_id}`, Number(row.points ?? 0)])
  );
  const totals = new Map(userRows.map((user) => [user.userId, 0]));

  const calculations = matchRows.map((match: any) => {
    const homeScore = Number(match.home_score);
    const awayScore = Number(match.away_score);
    const homePens = Number(match.home_penalty_goals ?? 0);
    const awayPens = Number(match.away_penalty_goals ?? 0);

    const cells = userRows.map((user) => {
      const key = `${match.id}:${user.userId}`;
      const prediction: any = predictionByKey.get(key);
      if (!prediction) return null;

      const actualPoints = ledgerByKey.get(key) ?? 0;
      const pointsWithPenalties = basePredictionPoints(
        Number(prediction.home_pred),
        Number(prediction.away_pred),
        homeScore,
        awayScore
      );
      const pointsWithoutPenalties = basePredictionPoints(
        Number(prediction.home_pred),
        Number(prediction.away_pred),
        homeScore - homePens,
        awayScore - awayPens
      );
      const earned = goldenWhistlePoints(actualPoints, pointsWithPenalties, pointsWithoutPenalties);
      totals.set(user.userId, Math.round(((totals.get(user.userId) ?? 0) + earned) * 100) / 100);

      return { actualPoints, pointsWithPenalties, pointsWithoutPenalties, earned };
    });

    return { match, homeScore, awayScore, homePens, awayPens, cells };
  });

  return (
    <details className="cardSoft" style={{ marginTop: 20 }}>
      <summary style={{ cursor: "pointer", padding: 16, fontWeight: 950, fontSize: 18 }}>
        Расчёт «Золотого свистка» · матчей с пенальти: {matchRows.length}
      </summary>

      <div style={{ padding: "0 16px 16px" }}>
        <div className="cardSoft" style={{ marginBottom: 14 }}>
          В зачёт идёт только положительная разница: фактические баллы минус баллы за тот же прогноз без результативных пенальти и без коэффициентов.
        </div>

        {calculations.length === 0 ? (
          <div style={{ opacity: 0.7 }}>В завершённых матчах этапа пока нет забитых пенальти.</div>
        ) : (
          <div className="tableWrap">
            <table className="table" style={{ minWidth: Math.max(820, 430 + userRows.length * 150) }}>
              <thead>
                <tr>
                  <th style={{ width: 60, textAlign: "center" }}>№</th>
                  <th>Матч и расчётный счёт</th>
                  {userRows.map((user) => (
                    <th key={user.userId} style={{ minWidth: 140, textAlign: "center" }}>
                      {user.login}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calculations.map(({ match, homeScore, awayScore, homePens, awayPens, cells }) => (
                  <tr key={match.id}>
                    <td style={{ textAlign: "center", fontWeight: 900 }}>
                      {match.stage_match_no ?? match.id}
                    </td>
                    <td>
                      <div style={{ fontWeight: 900 }}>
                        {teamName(match.home_team)} — {teamName(match.away_team)} · {homeScore}:{awayScore}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                        Без пенальти: {homeScore - homePens}:{awayScore - awayPens} · пенальти: {homePens}:{awayPens}
                      </div>
                    </td>
                    {cells.map((cell, index) => (
                      <td key={userRows[index].userId} style={{ textAlign: "center" }}>
                        {cell ? (
                          <>
                            <div style={{ fontWeight: 950 }}>{formatWhistlePoints(cell.earned)}</div>
                            <div style={{ marginTop: 3, fontSize: 11, opacity: 0.65 }}>
                              факт. {formatWhistlePoints(cell.actualPoints)} − без пен. {formatWhistlePoints(cell.pointsWithoutPenalties)}
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11, opacity: 0.65 }}>
                              база: {formatWhistlePoints(cell.pointsWithPenalties)} / {formatWhistlePoints(cell.pointsWithoutPenalties)}
                            </div>
                          </>
                        ) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ fontWeight: 950 }}>Итого</td>
                  {userRows.map((user) => (
                    <td key={user.userId} style={{ textAlign: "center", fontWeight: 950 }}>
                      {formatWhistlePoints(totals.get(user.userId) ?? 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
