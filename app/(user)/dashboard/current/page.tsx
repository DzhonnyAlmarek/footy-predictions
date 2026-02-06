import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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
  tour: { name: string } | { name: string }[] | null;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

type UserRow = {
  login: string;
  user_id: string;
};

type Pred = { h: number | null; a: number | null };

/* ================= helpers ================= */

function teamName(t: TeamMaybeArray): string {
  if (!t) return "?";
  if (Array.isArray(t)) return t[0]?.name ?? "?";
  return t.name ?? "?";
}

function getTourName(t: MatchRow["tour"]): string {
  if (!t) return "";
  if (Array.isArray(t)) return t[0]?.name ?? "";
  return t.name ?? "";
}

function signOutcome(h: number, a: number): -1 | 0 | 1 {
  if (h === a) return 0;
  return h > a ? 1 : -1;
}

function multByCount(cnt: number): number {
  if (cnt === 1) return 1.75;
  if (cnt === 2) return 1.5;
  if (cnt === 3) return 1.25;
  return 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPts(n: number | null): string {
  if (n == null) return "";
  return String(Math.round(n * 100) / 100);
}

function calcPtsForUser(params: {
  pred: Pred;
  resH: number | null;
  resA: number | null;
  outcomeMult: number;
  diffMult: number;
}): number | null {
  const { pred, resH, resA, outcomeMult, diffMult } = params;
  if (pred.h == null || pred.a == null) return null;
  if (resH == null || resA == null) return null;

  let pts = 0;

  // голы команд
  if (pred.h === resH) pts += 0.5;
  if (pred.a === resA) pts += 0.5;

  // исход
  if (signOutcome(pred.h, pred.a) === signOutcome(resH, resA)) {
    pts += 2 * outcomeMult;
  }

  // разница
  if (pred.h - pred.a === resH - resA) {
    pts += 1 * diffMult;
  }

  // промах на 1 мяч (в сумме)
  const dist = Math.abs(pred.h - resH) + Math.abs(pred.a - resA);
  if (dist === 1) pts += 0.5;

  return round2(pts);
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
        <h1>Текущая таблица</h1>
        <p>Текущий этап не выбран</p>
      </main>
    );
  }

  // users
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
  const matchIds = matches.map((m) => m.id);

  // predictions
  const { data: predsRaw } = await sb
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  // map preds
  const predByMatchUser = new Map<string, Map<string, Pred>>();
  for (const p of predsRaw ?? []) {
    if (!predByMatchUser.has(p.match_id)) {
      predByMatchUser.set(p.match_id, new Map());
    }
    predByMatchUser.get(p.match_id)!.set(p.user_id, {
      h: p.home_pred == null ? null : Number(p.home_pred),
      a: p.away_pred == null ? null : Number(p.away_pred),
    });
  }

  // counts
  const outcomeCount = new Map<string, number>();
  const diffCount = new Map<string, number>();

  for (const m of matches) {
    let o = 0;
    let d = 0;
    if (m.home_score != null && m.away_score != null) {
      for (const u of users) {
        const pr = predByMatchUser.get(m.id)?.get(u.user_id);
        if (!pr || pr.h == null || pr.a == null) continue;
        if (signOutcome(pr.h, pr.a) === signOutcome(m.home_score, m.away_score)) o++;
        if (pr.h - pr.a === m.home_score - m.away_score) d++;
      }
    }
    outcomeCount.set(m.id, o);
    diffCount.set(m.id, d);
  }

  return (
    <main className="userMain hasBottomBar">
      <h1 style={{ fontWeight: 900 }}>Текущая таблица</h1>

      <div className="tableWrap">
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th className="ctSticky ctColDate">Дата</th>
              <th className="ctSticky ctColMatch">Матч</th>
              <th className="ctSticky ctColRes">Рез.</th>
              {users.map((u) => (
                <th key={u.user_id} className="ctUserHead">
                  {u.login}
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

              const om = multByCount(outcomeCount.get(m.id) ?? 0);
              const dm = multByCount(diffCount.get(m.id) ?? 0);

              return (
                <tr key={m.id}>
                  <td className="ctSticky ctColDate">{date}</td>
                  <td className="ctSticky ctColMatch">
                    <div style={{ fontWeight: 800 }}>
                      {teamName(m.home_team)} — {teamName(m.away_team)}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {getTourName(m.tour)}
                    </div>
                  </td>
                  <td className="ctSticky ctColRes">{res}</td>

                  {users.map((u) => {
                    const pr =
                      predByMatchUser.get(m.id)?.get(u.user_id) ?? {
                        h: null,
                        a: null,
                      };

                    const pts = calcPtsForUser({
                      pred: pr,
                      resH: m.home_score,
                      resA: m.away_score,
                      outcomeMult: om,
                      diffMult: dm,
                    });

                    return (
                      <td key={u.user_id} className="ctCell">
                        <span style={{ fontFamily: "monospace" }}>
                          {pr.h == null || pr.a == null ? "—" : `${pr.h}:${pr.a}`}
                        </span>
                        {pts != null && (
                          <span style={{ marginLeft: 6, opacity: 0.7 }}>
                            ({formatPts(pts)})
                          </span>
                        )}
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
