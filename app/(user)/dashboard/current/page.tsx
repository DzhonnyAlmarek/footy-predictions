import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import PointsPopover, { type PointsBreakdown as PtsBD } from "@/app/_components/points-popover";
import { stageStatusLabel } from "@/lib/user-labels";

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
type TourMaybeArray =
  | { tour_no: string | number | null; name: string | null }
  | { tour_no: string | number | null; name: string | null }[]
  | null;

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  stage_match_no?: number | null;
  home_score: number | null;
  away_score: number | null;
  tour: TourMaybeArray;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

type UserRow = { login: string; user_id: string };
type Pred = { h: number | null; a: number | null };

type LedgerScoreRow = {
  match_id: number;
  user_id: string;
  points: number;
  points_outcome: number;
  points_diff: number;
  points_h1: number;
  points_h2: number;
  points_bonus: number;
  points_outcome_base: number;
  points_outcome_bonus: number;
  points_diff_base: number;
  points_diff_bonus: number;
};

function teamName(t: TeamMaybeArray): string {
  if (!t) return "?";
  if (Array.isArray(t)) return t[0]?.name ?? "?";
  return t.name ?? "?";
}

function tourTitle(tour: TourMaybeArray): string {
  if (!tour) return "—";
  const t = Array.isArray(tour) ? tour[0] : tour;
  if (!t) return "—";

  if (t.name?.trim()) return t.name.trim();

  const no =
    t.tour_no == null ? "" : String(t.tour_no).replace(/[^0-9]/g, "");

  return no ? `Тур ${no}` : "—";
}

function groupMatchesByTour(matches: MatchRow[]) {
  const groups = new Map<string, MatchRow[]>();

  for (const match of matches) {
    const title = tourTitle(match.tour);
    const group = groups.get(title);

    if (group) {
      group.push(match);
    } else {
      groups.set(title, [match]);
    }
  }

  return [...groups.entries()];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPts(n: number | null): string {
  if (n == null) return "";
  const x = Math.round(n * 100) / 100;
  return Number.isInteger(x) ? String(x) : String(x);
}

function placeIcon(place: number | null): string | null {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return null;
}

export default async function CurrentTablePage() {
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) {
    return (
      <main className="page">
        <h1>Текущая таблица</h1>
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
      tour:tours!matches_tour_id_fkey ( tour_no, name ),
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `)
    .eq("stage_id", (stage as any).id)
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => Number(m.id));

  const { data: predsRaw } =
    matchIds.length > 0 && userIds.length > 0
      ? await sb
          .from("predictions")
          .select("match_id,user_id,home_pred,away_pred")
          .in("match_id", matchIds)
          .in("user_id", userIds)
      : { data: [] as any[] };

  const predByMatchUser = new Map<number, Map<string, Pred>>();
  for (const p of predsRaw ?? []) {
    const mid = Number((p as any).match_id);
    if (!predByMatchUser.has(mid)) predByMatchUser.set(mid, new Map());
    predByMatchUser.get(mid)!.set(String((p as any).user_id), {
      h: (p as any).home_pred == null ? null : Number((p as any).home_pred),
      a: (p as any).away_pred == null ? null : Number((p as any).away_pred),
    });
  }

  const { data: ledgerRaw } =
    matchIds.length > 0 && userIds.length > 0
      ? await sb
          .from("points_ledger")
          .select(
            "match_id,user_id,points,points_outcome,points_diff,points_h1,points_h2,points_bonus,points_outcome_base,points_outcome_bonus,points_diff_base,points_diff_bonus"
          )
          .in("match_id", matchIds)
          .in("user_id", userIds)
      : { data: [] as any[] };

  const scoreByMatchUser = new Map<number, Map<string, LedgerScoreRow>>();
  for (const r of (ledgerRaw ?? []) as any[]) {
    const mid = Number(r.match_id);
    if (!scoreByMatchUser.has(mid)) scoreByMatchUser.set(mid, new Map());
    scoreByMatchUser.get(mid)!.set(String(r.user_id), {
      match_id: Number(r.match_id),
      user_id: String(r.user_id),
      points: Number(r.points ?? 0),
      points_outcome: Number(r.points_outcome ?? 0),
      points_diff: Number(r.points_diff ?? 0),
      points_h1: Number(r.points_h1 ?? 0),
      points_h2: Number(r.points_h2 ?? 0),
      points_bonus: Number(r.points_bonus ?? 0),
      points_outcome_base: Number(r.points_outcome_base ?? 0),
      points_outcome_bonus: Number(r.points_outcome_bonus ?? 0),
      points_diff_base: Number(r.points_diff_base ?? 0),
      points_diff_bonus: Number(r.points_diff_bonus ?? 0),
    });
  }

  const totalByUser = new Map<string, number>();
  for (const u of users) totalByUser.set(u.user_id, 0);

  for (const m of matches) {
    const mid = Number(m.id);
    for (const u of users) {
      const s = scoreByMatchUser.get(mid)?.get(u.user_id);
      if (s) {
        totalByUser.set(
          u.user_id,
          round2((totalByUser.get(u.user_id) ?? 0) + Number(s.points))
        );
      }
    }
  }

  const rankedUsers = [...users].sort((a, b) => {
    const tb = totalByUser.get(b.user_id) ?? 0;
    const ta = totalByUser.get(a.user_id) ?? 0;
    if (tb !== ta) return tb - ta;
    return a.login.localeCompare(b.login, "ru");
  });

  const placeByUserId = new Map<string, number>();
  rankedUsers.forEach((u, idx) => placeByUserId.set(u.user_id, idx + 1));

  const matchesByTour = groupMatchesByTour(matches);

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1>Текущая таблица</h1>
        <Link href="/dashboard">← Назад</Link>
      </div>

      <div className="pageMeta">
        Этап: <b>{(stage as any).name ?? `#${(stage as any).id}`}</b>
        {(stage as any).status ? <span> • {stageStatusLabel((stage as any).status)}</span> : null}
      </div>

      <div style={{ display: "grid", gap: 28, marginTop: 20 }}>
        {matchesByTour.map(([tourName, tourMatches]) => (
          <section
            key={tourName}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              overflow: "hidden",
              background: "#fff",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f8fafc",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
                {tourName}
              </h2>
              <div style={{ marginTop: 3, fontSize: 13, opacity: 0.7 }}>
                Матчей: {tourMatches.length}
              </div>
            </div>

            <div className="tableWrap" style={{ margin: 0, border: 0, borderRadius: 0 }}>
              <table className="table currentTable">
                <thead>
                  <tr>
                    <th style={{ width: 54, textAlign: "left" }}>№</th>
                    <th style={{ width: 320, textAlign: "left" }}>Матч</th>
                    <th style={{ width: 70, textAlign: "left" }}>Рез.</th>

                    {users.map((u) => {
                      const place = placeByUserId.get(u.user_id) ?? null;
                      const icon = placeIcon(place);

                      return (
                        <th
                          key={u.user_id}
                          className="ctUserHead"
                          style={{ textAlign: "left" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {icon && <span>{icon}</span>}
                            <span>{u.login}</span>
                          </div>
                          <div className="ctTotal">
                            ({formatPts(totalByUser.get(u.user_id) ?? 0)})
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {tourMatches.map((m) => {
                    const fallbackIndex = matches.findIndex((item) => item.id === m.id);
                    const no = m.stage_match_no ?? fallbackIndex + 1;
                    const resText =
                      m.home_score == null || m.away_score == null
                        ? "—"
                        : `${m.home_score}:${m.away_score}`;
                    const mid = Number(m.id);

                    return (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 900 }}>{no}</td>

                        <td>
                          <div style={{ fontWeight: 900 }}>
                            {teamName(m.home_team)} — {teamName(m.away_team)}
                          </div>
                        </td>

                        <td style={{ fontWeight: 900 }}>{resText}</td>

                        {users.map((u) => {
                          const pr =
                            predByMatchUser.get(mid)?.get(u.user_id) ?? {
                              h: null,
                              a: null,
                            };
                          const predText =
                            pr.h == null || pr.a == null ? "—" : `${pr.h}:${pr.a}`;
                          const s = scoreByMatchUser.get(mid)?.get(u.user_id);

                          return (
                            <td key={u.user_id} className="ctCell">
                              <span className="predText">{predText}</span>
                              {s ? (
                                <PointsPopover
                                  pts={Number(s.points)}
                                  breakdown={{} as PtsBD}
                                />
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
          </section>
        ))}
      </div>
    </main>
  );
}