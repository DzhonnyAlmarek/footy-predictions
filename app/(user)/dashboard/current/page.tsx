import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import PointsPopover, {
  type PointsBreakdown as PtsBD,
} from "@/app/_components/points-popover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ================= utils ================= */

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

/* ================= types ================= */

type TeamMaybeArray = { name: string } | { name: string }[] | null;

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
  tour?: { name: string } | { name: string }[] | null;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

type UserRow = {
  login: string;
  user_id: string;
};

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

/* ================= helpers ================= */

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

/* ================= page ================= */

export default async function DashboardCurrentTablePage() {
  // auth via fp_login
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  // current stage
  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) {
    return (
      <main className="userMain hasBottomBar">
        <h1 style={{ fontWeight: 900, margin: 0 }}>Текущая таблица</h1>
        <p style={{ marginTop: 10, opacity: 0.8 }}>Текущий этап не выбран</p>
      </main>
    );
  }

  // users (все участники, кроме ADMIN)
  const { data: usersRaw } = await sb
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login");

  const users = (usersRaw ?? []) as UserRow[];
  const userIds = users.map((u) => u.user_id);

  // matches
  const { data: matchesRaw } = await sb
    .from("matches")
    .select(`
      id,
      kickoff_at,
      home_score,
      away_score,
      tour:tours ( name ),
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `)
    .eq("stage_id", stage.id)
    .order("kickoff_at");

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => Number(m.id));

  // predictions (нужны для отображения predText даже если матч не сыгран)
  const { data: predsRaw } = await sb
    .from("predictions")
    .select("id,match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const predByMatchUser = new Map<number, Map<string, { pred: Pred; predictionId: number }>>();
  for (const p of predsRaw ?? []) {
    const mid = Number(p.match_id);
    if (!predByMatchUser.has(mid)) predByMatchUser.set(mid, new Map());
    predByMatchUser.get(mid)!.set(p.user_id, {
      predictionId: Number(p.id),
      pred: {
        h: p.home_pred == null ? null : Number(p.home_pred),
        a: p.away_pred == null ? null : Number(p.away_pred),
      },
    });
  }

  // prediction_scores for these matches/users
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

  // totals by user from stored scores
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
    <main className="userMain hasBottomBar">
      <h1 style={{ fontWeight: 900, margin: 0 }}>Текущая таблица</h1>
      <div style={{ marginTop: 6, opacity: 0.8 }}>
        Этап: <b>{stage.name ?? `#${stage.id}`}</b>
      </div>

      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th className="ctSticky ctColDate">Дата</th>
              <th className="ctSticky ctColMatch">Матч</th>
              <th className="ctSticky ctColRes">Рез.</th>
              {users.map((u) => (
                <th key={u.user_id} className="ctUserHead">
                  {u.login}
                  <span style={{ opacity: 0.7, fontWeight: 800 }}>
                    {" "}
                    ({formatPts(totalByUser.get(u.user_id) ?? 0)})
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {matches.map((m) => {
              const date = m.kickoff_at
                ? new Date(m.kickoff_at).toLocaleDateString("ru-RU")
                : "—";

              const res =
                m.home_score == null || m.away_score == null
                  ? "—"
                  : `${m.home_score}:${m.away_score}`;

              const mid = Number(m.id);

              return (
                <tr key={m.id}>
                  <td className="ctSticky ctColDate" style={{ whiteSpace: "nowrap" }}>
                    {date}
                  </td>

                  <td className="ctSticky ctColMatch">
                    <div style={{ fontWeight: 900 }}>
                      {teamName(m.home_team)} — {teamName(m.away_team)}
                    </div>
                  </td>

                  <td className="ctSticky ctColRes" style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
                    {res}
                  </td>

                  {users.map((u) => {
                    const predPack = predByMatchUser.get(mid)?.get(u.user_id);
                    const pr = predPack?.pred ?? { h: null, a: null };

                    const predText =
                      pr.h == null || pr.a == null ? "—" : `${pr.h}:${pr.a}`;

                    const s = scoreByMatchUser.get(mid)?.get(u.user_id);

                    return (
                      <td key={u.user_id} className="ctCell">
                        <span style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
                          {predText}
                        </span>

                        {s ? (
                          <PointsPopover pts={Number(s.total)} breakdown={toPtsBD(s)} />
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

      <div style={{ marginTop: 12 }}>
        <Link href="/dashboard">← Мои прогнозы</Link>
      </div>
    </main>
  );
}
