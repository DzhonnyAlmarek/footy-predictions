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
  stage_match_no: number | null;
  kickoff_at: string | null;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

function teamName(t: TeamMaybeArray): string {
  if (!t) return "?";
  if (Array.isArray(t)) return t[0]?.name ?? "?";
  return t.name ?? "?";
}

function daysTo(kickoffIso: string | null): number | null {
  if (!kickoffIso) return null;
  const d = new Date(kickoffIso);
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function warnKind(days: number | null): "none" | "soon" | "urgent" {
  if (days == null) return "none";
  if (days > 5) return "none";
  if (days > 2) return "soon";
  if (days > 1) return "urgent";
  return "urgent";
}

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
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) {
    return (
      <main className="page hasBottomBar">
        <h1>Мои прогнозы</h1>
        <p className="pageMeta">Текущий этап не выбран.</p>
        <div className="navRow">
          <Link href="/">На главную</Link>
        </div>
      </main>
    );
  }

  const { data: matchesRaw, error: matchesErr } = await sb
    .from("matches")
    .select(
      `
      id,
      stage_match_no,
      kickoff_at,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stage.id)
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (matchesErr) {
    return (
      <main className="page hasBottomBar">
        <h1>Мои прогнозы</h1>
        <p style={{ color: "crimson", marginTop: 10, fontWeight: 800 }}>
          Ошибка matches: {matchesErr.message}
        </p>
      </main>
    );
  }

  const matches = (matchesRaw ?? []) as unknown as MatchRow[];
  const matchIds = matches.map((m) => m.id);

  const { data: preds, error: predsErr } = await sb
    .from("predictions")
    .select("match_id,home_pred,away_pred")
    .eq("user_id", acc.user_id)
    .in("match_id", matchIds);

  if (predsErr) {
    return (
      <main className="page hasBottomBar">
        <h1>Мои прогнозы</h1>
        <p style={{ color: "crimson", marginTop: 10, fontWeight: 800 }}>
          Ошибка predictions: {predsErr.message}
        </p>
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
    <main className="page hasBottomBar">
      <h1>Мои прогнозы</h1>
      <div className="pageMeta">
        Этап: <b>{stage.name ?? `#${stage.id}`}</b>
        {stage.status ? <span> • {stage.status}</span> : null}
        <span> • {fpLogin}</span>
      </div>

      {!matches || matches.length === 0 ? (
        <div className="card" style={{ marginTop: 14, padding: 14 }}>
          Матчей нет.
        </div>
      ) : (
        <div className="tableWrap">
          <table className="table userPredTable">
            <thead>
              <tr>
                <th style={{ width: 54 }}>#</th>
                <th className="colDate">Дата</th>
                <th className="colMatch">Матч</th>
                <th className="colPred">Прогноз</th>
              </tr>
            </thead>

            <tbody>
              {matches.map((m) => {
                const kickoffStr = m.kickoff_at
                  ? new Date(m.kickoff_at).toLocaleDateString("ru-RU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—";

                const d = daysTo(m.kickoff_at);
                const kind = warnKind(d);

                const pr = predByMatch.get(m.id) ?? { h: null, a: null };

                return (
                  <tr
                    key={m.id}
                    className={kind === "urgent" ? "rowUrgent" : kind === "soon" ? "rowSoon" : ""}
                  >
                    <td style={{ opacity: 0.9, fontWeight: 900 }}>{m.stage_match_no ?? "—"}</td>

                    <td style={{ whiteSpace: "nowrap" }}>{kickoffStr}</td>

                    <td>
                      <div style={{ fontWeight: 900 }}>
                        {teamName(m.home_team)} — {teamName(m.away_team)}
                      </div>

                      {kind !== "none" ? <div className="rowWarn">⚠️ Скоро матч — сделай прогноз</div> : null}
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
    </main>
  );
}
