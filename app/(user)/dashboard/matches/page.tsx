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

function kickoffFlag(d: Date) {
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  return {
    isPast: ms < 0,
    isSoon: ms >= 0 && ms <= 2 * oneDay,
  };
}

function fmtDateMsk(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    timeZone: TZ_MSK,
    dateStyle: "medium",
  });
}

function fmtTimeMsk(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", {
    timeZone: TZ_MSK,
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MatchRow = {
  id: string;
  kickoff_at: string | null;
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
      home_team:teams!matches_home_team_id_fkey ( name, slug ),
      away_team:teams!matches_away_team_id_fkey ( name, slug )
    `
    )
    .eq("stage_id", stage.id)
    .order("kickoff_at", { ascending: true });

  if (matchesErr) {
    return (
      <main
        className="hasBottomBar"
        style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "crimson" }}
      >
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

        {/* ❌ topNav удалён — навигация только в AppHeader/BottomBar */}
      </header>

      <section style={{ marginTop: 18 }}>
        {!matches || matches.length === 0 ? (
          <p style={{ marginTop: 14 }}>Матчей нет.</p>
        ) : (
          <div className="tableWrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="thCenter" style={{ width: 170 }}>Дата (МСК)</th>
                  <th className="thCenter" style={{ width: 120 }}>Время (МСК)</th>
                  <th className="thLeft">Матч</th>
                  <th className="thCenter" style={{ width: 170 }}>Прогноз</th>
                </tr>
              </thead>

              <tbody>
                {(matches as any[]).map((m: MatchRow) => {
                  const kickoff = m.kickoff_at ? new Date(m.kickoff_at) : null;
                  const pr = predByMatch.get(m.id) ?? { h: null, a: null };

                  const timeCell = kickoff ? (() => {
                    const f = kickoffFlag(kickoff);
                    const cls = f.isPast ? "badgeDanger" : f.isSoon ? "badgeWarn" : "badgeNeutral";
                    return <span className={`badge ${cls}`}>{fmtTimeMsk(m.kickoff_at)}</span>;
                  })() : "—";

                  return (
                    <tr key={m.id}>
                      <td className="tdCenter" style={{ whiteSpace: "nowrap" }}>
                        {fmtDateMsk(m.kickoff_at)}
                      </td>

                      <td className="tdCenter" style={{ whiteSpace: "nowrap" }}>
                        {timeCell}
                      </td>

                      <td className="tdLeft">
                        <div style={{ fontWeight: 900 }}>
                          {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                        </div>
                      </td>

                      <td className="tdCenter">
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