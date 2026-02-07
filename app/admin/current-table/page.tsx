import Link from "next/link";
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

type ScoreRow = {
  prediction_id: number;
  match_id: number;
  user_id: string;

  total: number;

  team_goals: number;
  outcome: number;
  diff: number;
  near_bonus: number;

  outcome_guessed: number;
  outcome_mult: number;
  diff_guessed: number;
  diff_mult: number;

  pred_text: string;
  res_text: string;
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

function toPtsBD(s: ScoreRow): PtsBD {
  return {
    total: Number(s.total),
    teamGoals: Number(s.team_goals),
    outcome: Number(s.outcome),
    diff: Number(s.diff),
    nearBonus: Number(s.near_bonus),

    outcomeGuessed: Number(s.outcome_guessed),
    outcomeMult: Number(s.outcome_mult),
    diffGuessed: Number(s.diff_guessed),
    diffMult: Number(s.diff_mult),

    predText: s.pred_text,
    resText: s.res_text,
  };
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
    .eq("stage_id", stage.id)
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
    const mid = Number(p.match_id);
    if (!predByMatchUser.has(mid)) predByMatchUser.set(mid, new Map());
    predByMatchUser.get(mid)!.set(p.user_id, {
      h: p.home_pred == null ? null : Number(p.home_pred),
      a: p.away_pred == null ? null : Number(p.away_pred),
    });
  }

  const { data: scoresRaw } = await sb
    .from("prediction_scores")
    .select(
      "prediction_id,match_id,user_id,total,team_goals,outcome,diff,near_bonus,outcome_guessed,outcome_mult,diff_guessed,diff_mult,pred_text,res_text"
    )
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const scoreByMatchUser = new Map<number, Map<string, ScoreRow>>();
  for (const s of (scoresRaw ?? []) as any[]) {
    const mid = Number(s.match_id);
    if (!scoreByMatchUser.has(mid)) scoreByMatchUser.set(mid, new Map());
    scoreByMatchUser.get(mid)!.set(s.user_id, s as ScoreRow);
  }

  const totalByUser = new Map<string, number>();
  for (const u of users) totalByUser.set(u.user_id, 0);

  for (const m of matches) {
    const mid = Number(m.id);
    for (const u of users) {
      const s = scoreByMatchUser.get(mid)?.get(u.user_id);
      if (s) totalByUser.set(u.user_id, round2((totalByUser.get(u.user_id) ?? 0) + Number(s.total)));
    }
  }

  return (
    <main className="page">
      <h1>Текущая таблица (админ)</h1>
      <div className="pageMeta">
        Этап: <b>{stage.name ?? `#${stage.id}`}</b>
        {stage.status ? <span> • {stage.status}</span> : null}
      </div>

      <div className="tableWrap">
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 54 }}>№</th>
              <th>Матч</th>
              <th style={{ width: 70 }}>Рез.</th>
              {users.map((u) => (
                <th key={u.user_id} className="ctUserHead">
                  {u.login}{" "}
                  <span style={{ opacity: 0.7, fontWeight: 900 }}>
                    ({formatPts(totalByUser.get(u.user_id) ?? 0)})
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {matches.map((m, idx) => {
              const no = m.stage_match_no ?? idx + 1;
              const res =
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

                  <td style={{ fontWeight: 900, whiteSpace: "nowrap" }}>{res}</td>

                  {users.map((u) => {
                    const pr = predByMatchUser.get(mid)?.get(u.user_id) ?? { h: null, a: null };
                    const predText = pr.h == null || pr.a == null ? "—" : `${pr.h}:${pr.a}`;
                    const s = scoreByMatchUser.get(mid)?.get(u.user_id);

                    return (
                      <td key={u.user_id} className="ctCell">
                        <span className="predText">{predText}</span>
                        {s ? <PointsPopover pts={Number(s.total)} breakdown={toPtsBD(s)} /> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="navRow">
        <Link href="/admin/results">Рез-ты</Link>
        <Link href="/admin/users">Юзеры</Link>
        <Link href="/logout">Выйти</Link>
      </div>
    </main>
  );
}
