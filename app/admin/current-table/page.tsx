import { createClient } from "@/lib/supabase/server";
import type { CSSProperties } from "react";
import PointsPopover from "@/app/_components/points-popover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(x: number) {
  return Number(x ?? 0).toFixed(2).replace(/\.00$/, "");
}

function plus(x: number) {
  const v = Number(x ?? 0);
  return (v > 0 ? "+" : "") + fmt(v);
}

function winnersCountFromBonus(bonus: number) {
  const b = Number(bonus ?? 0);
  if (b >= 1.49) return 1;
  if (b >= 0.99) return 2;
  if (b >= 0.49) return 3;
  return null;
}

type Breakdown = {
  outcomeBase: number;
  outcomeBonus: number;
  diffBase: number;
  diffBonus: number;
  h1: number;
  h2: number;
  bonus: number;
};

function outcome(a: number | null, b: number | null) {
  if (a === null || b === null) return null;
  if (a === b) return "D";
  return a > b ? "H" : "A";
}

function cellStyle(
  pred: string,
  pts: number | undefined,
  homeScore: number | null,
  awayScore: number | null
): CSSProperties {
  if (homeScore === null || awayScore === null) return {};

  const [ph, pa] = pred.split(":").map((x) => Number(x));
  if (!Number.isFinite(ph) || !Number.isFinite(pa)) return {};

  const exact = ph === homeScore && pa === awayScore;
  const out = outcome(ph, pa);
  const real = outcome(homeScore, awayScore);
  const outcomeHit = out !== null && real !== null && out === real;

  if (exact) {
    return {
      fontWeight: 800,
      color: "#14532d",
      background: "rgba(34,197,94,0.12)",
      borderRadius: 6,
      padding: "2px 6px",
      display: "inline-block",
    };
  }

  if (outcomeHit) {
    return {
      fontWeight: 700,
      color: "#1f2937",
      background: "rgba(59,130,246,0.10)",
      borderRadius: 6,
      padding: "2px 6px",
      display: "inline-block",
    };
  }

  if (typeof pts === "number" && pts > 0) {
    return {
      fontWeight: 600,
      background: "rgba(0,0,0,0.04)",
      borderRadius: 6,
      padding: "2px 6px",
      display: "inline-block",
    };
  }

  return {};
}

export default async function AdminCurrentTablePage() {
  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) return <main style={{ padding: 24 }}>Текущий этап не выбран</main>;

  const { data: users } = await supabase
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login", { ascending: true });

  const logins = users?.map((u) => u.login) ?? [];
  const userIds = users?.map((u) => u.user_id) ?? [];
  const userIdToLogin = new Map(users?.map((u) => [u.user_id, u.login]));

  const { data: tours } = await supabase
    .from("tours")
    .select("id,tour_no,name")
    .eq("stage_id", stage.id)
    .order("tour_no", { ascending: true });

  const { data: matches } = await supabase
    .from("matches")
    .select(`
      id,tour_id,stage_match_no,home_score,away_score,
      home_team:teams!matches_home_team_id_fkey(name),
      away_team:teams!matches_away_team_id_fkey(name)
    `)
    .eq("stage_id", stage.id)
    .order("tour_id", { ascending: true })
    .order("kickoff_at", { ascending: true });

  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: preds } = await supabase
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds);

  const predMap = new Map<string, string>();
  for (const p of preds ?? []) {
    const l = userIdToLogin.get(p.user_id);
    if (l) predMap.set(`${p.match_id}::${l}`, `${p.home_pred}:${p.away_pred}`);
  }

  const { data: rows } = await supabase
    .from("points_ledger")
    .select(
      "match_id,user_id,points,points_outcome_base,points_outcome_bonus,points_diff_base,points_diff_bonus,points_h1,points_h2,points_bonus"
    )
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const pointsMap = new Map<string, number>();
  const breakdownMap = new Map<string, Breakdown>();
  const totalByLogin = new Map<string, number>();

  for (const r of rows ?? []) {
    const login = userIdToLogin.get(r.user_id);
    if (!login) continue;

    const pts = Number(r.points ?? 0);
    pointsMap.set(`${r.match_id}::${login}`, pts);
    totalByLogin.set(login, (totalByLogin.get(login) ?? 0) + pts);

    breakdownMap.set(`${r.match_id}::${login}`, {
      outcomeBase: Number(r.points_outcome_base ?? 0),
      outcomeBonus: Number(r.points_outcome_bonus ?? 0),
      diffBase: Number(r.points_diff_base ?? 0),
      diffBonus: Number(r.points_diff_bonus ?? 0),
      h1: Number(r.points_h1 ?? 0),
      h2: Number(r.points_h2 ?? 0),
      bonus: Number(r.points_bonus ?? 0),
    });
  }

  const gridCols = `minmax(220px, 1.6fr) 80px repeat(${logins.length}, minmax(120px, 1fr))`;

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div className="card">
        <div className="cardHeader">
          <div className="cardTitle">Текущая таблица</div>
          <div className="cardSub">
            Этап: <b>{stage.name ?? `#${stage.id}`}</b>
            {stage.status ? <span style={{ opacity: 0.65 }}> • {stage.status}</span> : null}
          </div>
        </div>

        <div className="cardBody">
          <div className="cardSoft">
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  padding: "8px 10px",
                  background: "#f7f7f7",
                  fontWeight: 900,
                  columnGap: 8,
                  alignItems: "center",
                }}
              >
                <div>Матч</div>
                <div style={{ textAlign: "center" }}>Рез.</div>
                {logins.map((l) => (
                  <div key={l}>
                    {l} <span style={{ opacity: 0.75 }}>({fmt(totalByLogin.get(l) ?? 0)})</span>
                  </div>
                ))}
              </div>

              {(tours ?? []).map((t: any) => {
                const list = (matches ?? []).filter((m: any) => m.tour_id === t.id);
                if (!list.length) return null;

                return (
                  <div key={t.id}>
                    <div style={{ padding: "8px 10px", fontWeight: 900, background: "#fafafa" }}>
                      Тур {t.tour_no}
                      {t.name ? ` — ${t.name}` : ""}
                    </div>

                    {list.map((m: any) => {
                      const result =
                        m.home_score !== null && m.away_score !== null ? `${m.home_score}:${m.away_score}` : "";

                      return (
                        <div
                          key={m.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: gridCols,
                            padding: "6px 10px",
                            borderTop: "1px solid #eee",
                            columnGap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <b>{m.stage_match_no}.</b> {m.home_team.name} — {m.away_team.name}
                          </div>

                          <div style={{ textAlign: "center", fontWeight: 900 }}>{result}</div>

                          {logins.map((l) => {
                            const key = `${m.id}::${l}`;
                            const pred = predMap.get(key) ?? "";
                            const pts = pointsMap.get(key);
                            const bd = breakdownMap.get(key);

                            const outcomeX = bd ? winnersCountFromBonus(bd.outcomeBonus) : null;
                            const diffX = bd ? winnersCountFromBonus(bd.diffBonus) : null;

                            const tip = bd
                              ? `Исход: ${fmt(bd.outcomeBase)}
${outcomeX ? `Надбавка за ${outcomeX} угадавших исход: ${plus(bd.outcomeBonus)}` : `Надбавка за угадавших исход: ${plus(bd.outcomeBonus)}`}
Итого за исход: ${fmt(bd.outcomeBase + bd.outcomeBonus)}

Разница: ${fmt(bd.diffBase)}
${diffX ? `Надбавка за ${diffX} угадавших разницу: ${plus(bd.diffBonus)}` : `Надбавка за угадавших разницу: ${plus(bd.diffBonus)}`}
Итого за разницу: ${fmt(bd.diffBase + bd.diffBonus)}

Голы 1-й команды: ${fmt(bd.h1)}
Голы 2-й команды: ${fmt(bd.h2)}
Бонус за отклонение 1 мяч: ${fmt(bd.bonus)}

Итого: ${fmt(
                                  bd.outcomeBase +
                                    bd.outcomeBonus +
                                    bd.diffBase +
                                    bd.diffBonus +
                                    bd.h1 +
                                    bd.h2 +
                                    bd.bonus
                                )}`
                              : "";

                            return (
                              <div key={l} style={{ minHeight: 22 }}>
                                <span style={cellStyle(pred, pts, m.home_score, m.away_score)}>
                                  {pred}
                                  {typeof pts === "number" ? (
                                    <span style={{ opacity: 0.85 }}> ({fmt(pts)})</span>
                                  ) : null}
                                </span>

                                {tip ? <PointsPopover tip={tip} /> : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
