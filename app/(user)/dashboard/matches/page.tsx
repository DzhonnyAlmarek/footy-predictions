import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import PredCellEditable from "../pred-cell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TZ_MSK = "Europe/Moscow";

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

function fmtKickoffMsk(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    timeZone: TZ_MSK,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtDeadlineMsk(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  // Дедлайн ты показываешь как дату — оставим так, но строго МСК
  return d.toLocaleDateString("ru-RU", {
    timeZone: TZ_MSK,
    dateStyle: "medium",
  });
}

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  deadline_at: string | null;
  home_team: { name: string; slug: string } | null;
  away_team: { name: string; slug: string } | null;
};

export default async function DashboardMatchesPage() {
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
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) redirect("/dashboard");

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
      <main className="hasBottomBar" style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "crimson" }}>
        Ошибка matches: {matchesErr.message}
      </main>
    );
  }

  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: preds } = await sb
    .from("predictions")
    .select("match_id,home_pred,away_pred")
    .eq("user_id", acc.user_id)
    .in("match_id", matchIds);

  const predByMatch = new Map<string, { h: number | null; a: number | null }>();
  for (const p of preds ?? []) {
    predByMatch.set(p.match_id, {
      h: p.home_pred == null ? null : Number(p.home_pred),
      a: p.away_pred == null ? null : Number(p.away_pred),
    });
  }

  return (
    <main className="hasBottomBar" style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Матчи</h1>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Этап: <b>{stage.name ?? `#${stage.id}`}</b>
            <span className="badge badgeNeutral" style={{ marginLeft: 10 }}>{fpLogin}</span>
            <span className="badge badgeNeutral" style={{ marginLeft: 10 }}>МСК</span>
          </div>
        </div>

        <nav className="topNav">
          <Link href="/dashboard">Текущая таблица</Link>
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
                  <th style={{ width: 170 }}>Дата (МСК)</th>
                  <th>Матч</th>
                  <th style={{ width: 180 }}>Дедлайн (МСК)</th>
                  <th style={{ width: 170 }}>Прогноз</th>
                </tr>
              </thead>

              <tbody>
                {(matches as any[]).map((m: MatchRow) => {
                  const deadline = m.deadline_at ? new Date(m.deadline_at) : null;
                  const pr = predByMatch.get(m.id) ?? { h: null, a: null };

                  return (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtKickoffMsk(m.kickoff_at)}</td>

                      <td>
                        <div style={{ fontWeight: 900 }}>
                          {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                        </div>
                      </td>

                      <td style={{ whiteSpace: "nowrap" }}>
                        {deadline ? (() => {
                          const f = deadlineFlag(deadline);
                          const cls = f.isPast ? "badgeDanger" : f.isSoon ? "badgeWarn" : "badgeNeutral";
                          return <span className={`badge ${cls}`}>{fmtDeadlineMsk(m.deadline_at)}</span>;
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

      {/* ✅ Bottom bar (mobile only) */}
      <div className="mobileBottomBar" role="navigation" aria-label="Навигация">
        <Link href="/dashboard">🏠 Таблица</Link>
        <Link href="/golden-boot">🥇 Бутса</Link>
        <a href="/logout">🚪 Выйти</a>
      </div>
    </main>
  );
}