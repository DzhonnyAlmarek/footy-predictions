import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import PointsPopover, { type PointsBreakdown as PtsBD } from "@/app/_components/points-popover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

type TeamMaybeArray = { name: string } | { name: string }[] | null;

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  stage_match_no?: number | null;
  home_score: number | null;
  away_score: number | null;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

type UserRow = { login: string; user_id: string };
type Pred = { h: number | null; a: number | null };

type LedgerScoreRow = {
  match_id: number;
  user_id: string;

  points: number;

  points_outcome: number;
  points_diff: number;
  points_h1: number;
  points_h2: number;
  points_bonus: number;

  points_outcome_base: number;
  points_outcome_bonus: number;
  points_diff_base: number;
  points_diff_bonus: number;
};

function teamName(t: TeamMaybeArray): string {
  if (!t) return "?";
  if (Array.isArray(t)) return t[0]?.name ?? "?";
  return t.name ?? "?";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPts(n: number | null): string {
  if (n == null) return "";
  const x = Math.round(n * 100) / 100;
  return Number.isInteger(x) ? String(x) : String(x);
}

function sign(n: number) {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

function deriveMult(totalPart: number, base: number): number | null {
  if (!base || base <= 0) return null;
  const m = totalPart / base;
  const r = Math.round(m * 100) / 100;
  return Number.isFinite(r) ? r : null;
}

export default async function AdminCurrentTablePage() {
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");
  if (fpLogin !== "ADMIN") redirect("/dashboard");

  const sb = service();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) {
    return (
      <main className="page">
        <h1>Текущая таблица (админ)</h1>
        <p className="pageMeta">Текущий этап не выбран</p>
      </main>
    );
  }

  const { data: usersRaw } = await sb
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login");

  const users = (usersRaw ?? []) as UserRow[];
  const userIds = users.map((u) => u.user_id);

  const { data: matchesRaw } = await sb
    .from("matches")
    .select(`
      id,
      kickoff_at,
      stage_match_no,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `)
    .eq("stage_id", (stage as any).id)
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => Number(m.id));

  const { data: predsRaw } = await sb
    .from("predictions")
    .select("id,match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const predByMatchUser = new Map<number, Map<string, Pred>>();
  for (const p of predsRaw ?? []) {
    const mid = Number((p as any).match_id);
    if (!predByMatchUser.has(mid)) predByMatchUser.set(mid, new Map());
    predByMatchUser.get(mid)!.set(String((p as any).user_id), {
      h: (p as any).home_pred == null ? null : Number((p as any).home_pred),
      a: (p as any).away_pred == null ? null : Number((p as any).away_pred),
    });
  }

  // ✅ ledger (+ base/bonus)
  const { data: ledgerRaw } = await sb
    .from("points_ledger")
    .select(
      "match_id,user_id,points,points_outcome,points_diff,points_h1,points_h2,points_bonus,points_outcome_base,points_outcome_bonus,points_diff_base,points_diff_bonus"
    )
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const scoreByMatchUser = new Map<number, Map<string, LedgerScoreRow>>();
  for (const r of (ledgerRaw ?? []) as any[]) {
    const mid = Number(r.match_id);
    if (!scoreByMatchUser.has(mid)) scoreByMatchUser.set(mid, new Map());
    scoreByMatchUser.get(mid)!.set(String(r.user_id), {
      match_id: Number(r.match_id),
      user_id: String(r.user_id),

      points: Number(r.points ?? 0),

      points_outcome: Number(r.points_outcome ?? 0),
      points_diff: Number(r.points_diff ?? 0),
      points_h1: Number(r.points_h1 ?? 0),
      points_h2: Number(r.points_h2 ?? 0),
      points_bonus: Number(r.points_bonus ?? 0),

      points_outcome_base: Number(r.points_outcome_base ?? 0),
      points_outcome_bonus: Number(r.points_outcome_bonus ?? 0),
      points_diff_base: Number(r.points_diff_base ?? 0),
      points_diff_bonus: Number(r.points_diff_bonus ?? 0),
    });
  }

  // ===== guessed counts (исход/разница) по матчу =====
  const outcomeGuessedByMatch = new Map<number, number>();
  const diffGuessedByMatch = new Map<number, number>();
  const totalPredsByMatch = new Map<number, number>();

  for (const m of matches) {
    const mid = Number(m.id);

    // учитываем только матчи с известным результатом
    if (m.home_score == null || m.away_score == null) {
      outcomeGuessedByMatch.set(mid, 0);
      diffGuessedByMatch.set(mid, 0);
      totalPredsByMatch.set(mid, 0);
      continue;
    }

    const resSign = sign(Number(m.home_score) - Number(m.away_score));
    const resDiff = Number(m.home_score) - Number(m.away_score);

    let totalPreds = 0;
    let outcomeGuessed = 0;
    let diffGuessed = 0;

    const mp = predByMatchUser.get(mid);
    for (const u of users) {
      const pr = mp?.get(u.user_id);
      if (!pr || pr.h == null || pr.a == null) continue;

      totalPreds++;
      const prSign = sign(pr.h - pr.a);
      const prDiff = pr.h - pr.a;

      if (prSign === resSign) outcomeGuessed++;
      if (prDiff === resDiff) diffGuessed++;
    }

    outcomeGuessedByMatch.set(mid, outcomeGuessed);
    diffGuessedByMatch.set(mid, diffGuessed);
    totalPredsByMatch.set(mid, totalPreds);
  }

  // totals по пользователю из ledger
  const totalByUser = new Map<string, number>();
  for (const u of users) totalByUser.set(u.user_id, 0);

  for (const m of matches) {
    const mid = Number(m.id);
    for (const u of users) {
      const s = scoreByMatchUser.get(mid)?.get(u.user_id);
      if (s) totalByUser.set(u.user_id, round2((totalByUser.get(u.user_id) ?? 0) + Number(s.points)));
    }
  }

  function toPtsBDVariant1(
    m: MatchRow,
    u: UserRow,
    predText: string,
    resText: string,
    s: LedgerScoreRow,
    pr: Pred
  ): PtsBD {
    const homeRes = m.home_score;
    const awayRes = m.away_score;

    // Голы команд: 0.5 + 0.5 (если угадал точные голы по каждой команде)
    const homeGoalsPts =
      pr.h != null && homeRes != null && pr.h === Number(homeRes) ? 0.5 : 0;
    const awayGoalsPts =
      pr.a != null && awayRes != null && pr.a === Number(awayRes) ? 0.5 : 0;

    const outcomeTotal = Number(s.points_outcome ?? 0);
    const outcomeBase = Number(s.points_outcome_base ?? 0);
    const outcomeMultBonus = Number(s.points_outcome_bonus ?? 0);
    const outcomeMult = deriveMult(outcomeTotal, outcomeBase);

    const diffTotal = Number(s.points_diff ?? 0);
    const diffBase = Number(s.points_diff_base ?? 0);
    const diffMultBonus = Number(s.points_diff_bonus ?? 0);
    const diffMult = deriveMult(diffTotal, diffBase);

    const mid = Number(m.id);
    const totalPreds = totalPredsByMatch.get(mid) ?? 0;

    return {
      total: Number(s.points ?? 0),
      predText,
      resText,

      homeGoalsPts,
      awayGoalsPts,
      homeGoalsPred: pr.h,
      awayGoalsPred: pr.a,
      homeGoalsRes: homeRes,
      awayGoalsRes: awayRes,

      outcomeBase,
      outcomeTotal,
      outcomeMultBonus,
      outcomeMult,
      outcomeGuessed: outcomeGuessedByMatch.get(mid) ?? 0,
      outcomeTotalPreds: totalPreds,

      diffBase,
      diffTotal,
      diffMultBonus,
      diffMult,
      diffGuessed: diffGuessedByMatch.get(mid) ?? 0,
      diffTotalPreds: totalPreds,

      h1: Number(s.points_h1 ?? 0),
      h2: Number(s.points_h2 ?? 0),
      bonus: Number(s.points_bonus ?? 0),
    };
  }

  return (
    <main className="page">
      <h1>Текущая таблица (админ)</h1>

      <div className="pageMeta">
        Этап: <b>{(stage as any).name ?? `#${(stage as any).id}`}</b>
        {(stage as any).status ? <span> • {(stage as any).status}</span> : null}
      </div>

      <div className="tableWrap">
        <table className="table currentTable">
          <thead>
            <tr>
              <th style={{ width: 54 }}>№</th>
              <th style={{ width: 320 }}>Матч</th>
              <th style={{ width: 70 }}>Рез.</th>

              {users.map((u) => (
                <th key={u.user_id} className="ctUserHead">
                  {u.login}
                  <span className="ctTotal">({formatPts(totalByUser.get(u.user_id) ?? 0)})</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {matches.map((m, idx) => {
              const no = m.stage_match_no ?? idx + 1;
              const resText =
                m.home_score == null || m.away_score == null ? "—" : `${m.home_score}:${m.away_score}`;
              const mid = Number(m.id);

              return (
                <tr key={m.id}>
                  <td style={{ fontWeight: 900, whiteSpace: "nowrap" }}>{no}</td>

                  <td>
                    <div style={{ fontWeight: 900 }}>
                      {teamName(m.home_team)} — {teamName(m.away_team)}
                    </div>
                  </td>

                  <td style={{ fontWeight: 900, whiteSpace: "nowrap" }}>{resText}</td>

                  {users.map((u) => {
                    const pr = predByMatchUser.get(mid)?.get(u.user_id) ?? { h: null, a: null };
                    const predText = pr.h == null || pr.a == null ? "—" : `${pr.h}:${pr.a}`;
                    const s = scoreByMatchUser.get(mid)?.get(u.user_id);

                    return (
                      <td key={u.user_id} className="ctCell">
                        <span className="predText">{predText}</span>

                        {s ? (
                          <PointsPopover
                            pts={Number(s.points)}
                            breakdown={toPtsBDVariant1(m, u, predText, resText, s, pr)}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}