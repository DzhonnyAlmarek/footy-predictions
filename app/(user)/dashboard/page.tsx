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
  home_team: { name: string; slug: string } | null;
  away_team: { name: string; slug: string } | null;
};

function fmtKickoff(dt: Date) {
  return dt.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function fmtDeadlineDateOnly(dt: Date) {
  return dt.toLocaleDateString("ru-RU", { dateStyle: "medium" });
}

export default async function DashboardPage() {
  // auth via fp_login
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  // user_id by login
  const { data: acc, error: accErr } = await sb
    .from("login_accounts")
    .select("user_id")
    .eq("login", fpLogin)
    .maybeSingle();

  if (accErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16, color: "crimson" }}>
        Ошибка login_accounts: {accErr.message}
      </main>
    );
  }
  if (!acc?.user_id) redirect("/");

  // current stage
  const { data: stage, error: stageErr } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (stageErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16, color: "crimson" }}>
        Ошибка stages: {stageErr.message}
      </main>
    );
  }

  if (!stage) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
          <nav className="topNav">
            <Link href="/dashboard">Текущая таблица</Link>
            <Link href="/golden-boot">Золотая бутса</Link>
            <a href="/logout">Выйти</a>
          </nav>
        </header>

        <div style={{ marginTop: 16 }} className="card">
          <div className="cardBody">Текущий этап не выбран.</div>
        </div>
      </main>
    );
  }

  // matches in current stage
  const { data: matches, error: matchesErr } = await sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      home_team:teams!matches_home_team_id_fkey ( name, slug ),
      away_team:teams!matches_away_team_id_fkey ( name, slug )
    `
    )
    .eq("stage_id", stage.id)
    .order("kickoff_at", { ascending: true });

  if (matchesErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16, color: "crimson" }}>
        Ошибка matches: {matchesErr.message}
      </main>
    );
  }

  const matchIds = (matches ?? []).map((m: any) => m.id);

  // predictions for this user
  const { data: preds, error: predsErr } = await sb
    .from("predictions")
    .select("match_id,home_pred,away_pred")
    .eq("user_id", acc.user_id)
    .in("match_id", matchIds);

  if (predsErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16, color: "crimson" }}>
        Ошибка predictions: {predsErr.message}
      </main>
    );
  }

  const predByMatch = new Map<string, { h: number | null; a: number | null }>();
  for (const p of preds ?? []) {
    predByMatch.set(p.match_id, {
      h: p.home_pred == null ? null : Number(p.home_pred),
      a: p.away_pred == null ? null : Number(p.away_pred),
    });
  }

  const now = new Date();

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Текущая таблица</h1>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
            Этап: <b style={{ color: "inherit" }}>{stage.name ?? `#${stage.id}`}</b>{" "}
            <span className="badge" style={{ marginLeft: 10 }}>{fpLogin}</span>
          </div>
        </div>

        <nav className="topNav">
          <Link href="/dashboard">Текущая таблица</Link>
          <Link href="/golden-boot">Золотая бутса</Link>
          <a href="/logout">Выйти</a>
        </nav>
      </header>

      {/* DESKTOP TABLE */}
      <section className="desktopOnly" style={{ marginTop: 16 }}>
        {!matches || matches.length === 0 ? (
          <div className="card">
            <div className="cardBody">Матчей нет.</div>
          </div>
        ) : (
          <div className="tableWrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Дата</th>
                  <th>Матч</th>
                  <th style={{ width: 170 }}>Дедлайн</th>
                  <th style={{ width: 170 }}>Прогноз</th>
                </tr>
              </thead>

              <tbody>
                {(matches as any[]).map((m: MatchRow) => {
                  const kickoff = m.kickoff_at ? new Date(m.kickoff_at) : null;
                  const deadline = m.deadline_at ? new Date(m.deadline_at) : null;

                  const pr = predByMatch.get(m.id) ?? { h: null, a: null };
                  const canEdit = deadline ? now.getTime() < deadline.getTime() : true;

                  return (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {kickoff ? fmtKickoff(kickoff) : "—"}
                      </td>

                      <td>
                        <div style={{ fontWeight: 900 }}>
                          {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                        </div>
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>
                        {deadline ? fmtDeadlineDateOnly(deadline) : "—"}
                      </td>

                      <td>
                        <PredCellEditable
                          matchId={Number(m.id)}
                          homePred={pr.h}
                          awayPred={pr.a}
                          canEdit={canEdit}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MOBILE CARDS */}
      <section className="mobileOnly" style={{ marginTop: 16 }}>
        {!matches || matches.length === 0 ? (
          <div className="card">
            <div className="cardBody">Матчей нет.</div>
          </div>
        ) : (
          <div className="matchCards">
            {(matches as any[]).map((m: MatchRow) => {
              const kickoff = m.kickoff_at ? new Date(m.kickoff_at) : null;
              const deadline = m.deadline_at ? new Date(m.deadline_at) : null;

              const pr = predByMatch.get(m.id) ?? { h: null, a: null };
              const canEdit = deadline ? now.getTime() < deadline.getTime() : true;

              return (
                <div key={m.id} className="matchCard">
                  <div className="matchRowTop">
                    <div>
                      <div className="matchTeams">
                        {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                      </div>
                      <div className="matchMeta">
                        <div>
                          <b>Kickoff:</b> {kickoff ? fmtKickoff(kickoff) : "—"}
                        </div>
                        <div>
                          <b>Дедлайн:</b> {deadline ? fmtDeadlineDateOnly(deadline) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="matchPred">
                    <PredCellEditable
                      matchId={Number(m.id)}
                      homePred={pr.h}
                      awayPred={pr.a}
                      canEdit={canEdit}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
