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

type TeamMaybeArray = { name: string } | { name: string }[] | null;

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  deadline_at: string | null;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

function teamName(t: TeamMaybeArray): string {
  if (!t) return "?";
  if (Array.isArray(t)) return t[0]?.name ?? "?";
  return t.name ?? "?";
}

export default async function DashboardPage() {
  // auth via fp_login (cookie)
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
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
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
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
        Ошибка stages: {stageErr.message}
      </main>
    );
  }

  if (!stage) {
    return (
      <main className="userMain hasBottomBar">
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

  // matches of current stage
  const { data: matchesRaw, error: matchesErr } = await sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stage.id)
    .order("kickoff_at", { ascending: true });

  if (matchesErr) {
    return (
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
        Ошибка matches: {matchesErr.message}
      </main>
    );
  }

  const matches = (matchesRaw ?? []) as unknown as MatchRow[];
  const matchIds = matches.map((m) => m.id);

  // predictions of user for those matches
  const { data: preds, error: predsErr } = await sb
    .from("predictions")
    .select("match_id,home_pred,away_pred")
    .eq("user_id", acc.user_id)
    .in("match_id", matchIds);

  if (predsErr) {
    return (
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
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
    <main className="userMain hasBottomBar">
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Мои прогнозы</h1>

        <div style={{ marginTop: 6, opacity: 0.8 }}>
          Этап: <b>{stage.name ?? `#${stage.id}`}</b>
          {stage.status ? <span style={{ opacity: 0.65 }}> • {stage.status}</span> : null}
          <span style={{ opacity: 0.65 }}> • {fpLogin}</span>
        </div>

        {/* 👇 Здесь меню НЕ делаем — оно должно быть только в layout + bottom bar */}
      </header>

      <section>
        {!matches || matches.length === 0 ? (
          <p style={{ marginTop: 14 }}>Матчей нет.</p>
        ) : (
          <div className="tableWrap">
            {/* ✅ фиксируем ширины колонок */}
            <table className="table tableFixed">
              <colgroup>
                <col className="colDate" />
                <col />
                <col className="colDeadline" />
                <col className="colPred" />
              </colgroup>

              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Матч</th>
                  <th>Дедлайн</th>
                  <th>Прогноз</th>
                </tr>
              </thead>

              <tbody>
                {matches.map((m) => {
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
                      <td style={{ whiteSpace: "nowrap" }}>{kickoff}</td>

                      <td>
                        <div className="strong">
                          {teamName(m.home_team)} — {teamName(m.away_team)}
                        </div>
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>{deadline}</td>

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
