import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import PredCellEditable from "./pred-cell";

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

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  deadline_at: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
};

export default async function DashboardPage() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  const { data: acc } = await sb
    .from("login_accounts")
    .select("user_id")
    .eq("login", fpLogin)
    .maybeSingle();

  if (!acc?.user_id) redirect("/");

  const { data: stage } = await sb
    .from("stages")
    .select("id,name")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) {
    return (
      <main className="userMain">
        <h1>Мои прогнозы</h1>
        <p>Текущий этап не выбран</p>
      </main>
    );
  }

  const { data: matches } = await sb
    .from("matches")
    .select(`
      id,
      kickoff_at,
      deadline_at,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `)
    .eq("stage_id", stage.id)
    .order("kickoff_at");

  const matchIds = (matches ?? []).map((m) => m.id);

  const { data: preds } = await sb
    .from("predictions")
    .select("match_id,home_pred,away_pred")
    .eq("user_id", acc.user_id)
    .in("match_id", matchIds);

  const predByMatch = new Map<string, { h: number | null; a: number | null }>();
  for (const p of preds ?? []) {
    predByMatch.set(p.match_id, {
      h: p.home_pred,
      a: p.away_pred,
    });
  }

  return (
    <main className="userMain hasBottomBar">
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Мои прогнозы</h1>
        <div style={{ opacity: 0.75 }}>
          Этап: <b>{stage.name}</b> • {fpLogin}
        </div>

        <nav className="topNav" style={{ marginTop: 12 }}>
          <Link href="/dashboard">Мои прогнозы</Link>
          <Link href="/golden-boot">Золотая бутса</Link>
          <a href="/logout">Выйти</a>
        </nav>
      </header>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Матч</th>
              <th>Дедлайн</th>
              <th>Прогноз</th>
            </tr>
          </thead>
          <tbody>
            {(matches ?? []).map((m: MatchRow) => {
              const kickoff = m.kickoff_at
                ? new Date(m.kickoff_at).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—";

              const deadline = m.deadline_at
                ? new Date(m.deadline_at).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—";

              const pr = predByMatch.get(m.id) ?? { h: null, a: null };

              return (
                <tr key={m.id}>
                  <td>{kickoff}</td>
                  <td style={{ fontWeight: 900 }}>
                    {m.home_team?.name ?? "?"} —{" "}
                    {m.away_team?.name ?? "?"}
                  </td>
                  <td>{deadline}</td>
                  <td>
                    <PredCellEditable
                      matchId={Number(m.id)}
                      homePred={pr.h}
                      awayPred={pr.a}
                      canEdit={true}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
