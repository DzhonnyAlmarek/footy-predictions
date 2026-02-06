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

function deadlineFlag(d: Date) {
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  return {
    isPast: ms < 0,
    isSoon: ms >= 0 && ms <= 2 * oneDay,
  };
}

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  deadline_at: string | null;
  status: string | null;
  home_team: { name: string; slug: string } | null;
  away_team: { name: string; slug: string } | null;
};

export default async function DashboardPage() {
  // ✅ авторизация через fp_login
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  // user_id по login
  const { data: acc, error: accErr } = await sb
    .from("login_accounts")
    .select("user_id")
    .eq("login", fpLogin)
    .maybeSingle();

  if (accErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "crimson" }}>
        Ошибка login_accounts: {accErr.message}
      </main>
    );
  }
  if (!acc?.user_id) redirect("/");

  // текущий этап
  const { data: stage, error: stageErr } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (stageErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "crimson" }}>
        Ошибка stages: {stageErr.message}
      </main>
    );
  }

  if (!stage) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Мои прогнозы</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>Текущий этап не выбран.</p>
        <div style={{ marginTop: 14 }}>
          <Link href="/" style={{ textDecoration: "underline" }}>
            На главную
          </Link>
        </div>
      </main>
    );
  }

  // матчи текущего этапа
  const { data: matches, error: matchesErr } = await sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      status,
      home_team:teams!matches_home_team_id_fkey ( name, slug ),
      away_team:teams!matches_away_team_id_fkey ( name, slug )
    `
    )
    .eq("stage_id", stage.id)
    .order("kickoff_at", { ascending: true });

  if (matchesErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "crimson" }}>
        Ошибка matches: {matchesErr.message}
      </main>
    );
  }

  const matchIds = (matches ?? []).map((m: any) => m.id);

  // прогнозы пользователя по этим матчам
  const { data: preds, error: predsErr } = await sb
    .from("predictions")
    .select("match_id,home_pred,away_pred")
    .eq("user_id", acc.user_id)
    .in("match_id", matchIds);

  if (predsErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "crimson" }}>
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

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Мои прогнозы</h1>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Этап: <b>{stage.name ?? `#${stage.id}`}</b>
            {stage.status ? <span style={{ opacity: 0.65 }}> • {stage.status}</span> : null}
            <span className="badge badgeNeutral" style={{ marginLeft: 10 }}>
              {fpLogin}
            </span>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/dashboard/matches">Матчи</Link>
          <Link href="/golden-boot">Золотая бутса</Link>
          <a href="/logout">Выйти</a>
        </nav>
      </header>

      <section style={{ marginTop: 18 }}>
        {!matches || matches.length === 0 ? (
          <p style={{ marginTop: 14 }}>Матчей нет.</p>
        ) : (
          <div className="tableWrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Дата</th>
                  <th>Матч</th>
                  <th style={{ width: 180 }}>Дедлайн</th>
                  <th style={{ width: 170 }}>Прогноз</th>
                </tr>
              </thead>

              <tbody>
                {(matches as any[]).map((m: MatchRow) => {
                  const kickoff = m.kickoff_at ? new Date(m.kickoff_at) : null;
                  const deadline = m.deadline_at ? new Date(m.deadline_at) : null;

                  const pr = predByMatch.get(m.id) ?? { h: null, a: null };

                  return (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {kickoff
                          ? kickoff.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })
                          : "—"}
                      </td>

                      <td>
                        <div style={{ fontWeight: 900 }}>
                          {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                        </div>
                        <div style={{ marginTop: 4, opacity: 0.7, fontSize: 12 }}>
                          {m.status ?? ""}
                        </div>
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>
                        {deadline ? (() => {
                          const f = deadlineFlag(deadline);
                          const cls = f.isPast ? "badgeDanger" : f.isSoon ? "badgeWarn" : "badgeNeutral";
                          return (
                            <span className={`badge ${cls}`}>
                              {deadline.toLocaleDateString("ru-RU", { dateStyle: "medium" })}
                            </span>
                          );
                        })() : "—"}
                      </td>

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
        )}
      </section>
    </main>
  );
}
