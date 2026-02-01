import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CSSProperties } from "react";
import PointsPopover from "@/app/_components/points-popover";
import PredCellEditable from "./pred-cell";

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

function isExactPred(pred: string, homeScore: number | null, awayScore: number | null) {
  if (!pred) return false;
  if (homeScore === null || awayScore === null) return false;

  const [ph, pa] = pred.split(":").map((x) => Number(x));
  if (!Number.isFinite(ph) || !Number.isFinite(pa)) return false;

  return ph === homeScore && pa === awayScore;
}

/**
 * ВАЖНО:
 * - ОДИНАКОВЫЙ стиль для всех ячеек (чтобы не было смещений)
 * - Подсветка ТОЛЬКО exact
 * - Подсветка не меняет размеры (нет border, только background + inset shadow)
 */
function cellStyleBase(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
    padding: "2px 6px",
    borderRadius: 6,
    lineHeight: 1.2,
  };
}

function cellStyleExact(exact: boolean): CSSProperties {
  const base = cellStyleBase();
  if (!exact) return base;

  return {
    ...base,
    fontWeight: 800,
    color: "#14532d",
    background: "rgba(34,197,94,0.14)",
    boxShadow: "inset 0 0 0 1px rgba(34,197,94,0.35)",
  };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;
  if (!me) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/">Войти</Link>
      </main>
    );
  }

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) return <main style={{ padding: 24 }}>Текущий этап не выбран</main>;

  const stageLocked = stage.status === "locked";

  const { data: users } = await supabase
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login", { ascending: true });

  const logins = users?.map((u) => u.login) ?? [];
  const userIds = users?.map((u) => u.user_id) ?? [];
  const userIdToLogin = new Map(users?.map((u) => [u.user_id, u.login]));
  const myLogin = userIdToLogin.get(me.id) ?? null;

  const { data: tours } = await supabase
    .from("tours")
    .select("id,tour_no,name")
    .eq("stage_id", stage.id)
    .order("tour_no", { ascending: true });

  const { data: matches } = await supabase
    .from("matches")
    .select(
      `
      id,tour_id,stage_match_no,kickoff_at,deadline_at,home_score,away_score,
      home_team:teams!matches_home_team_id_fkey(name),
      away_team:teams!matches_away_team_id_fkey(name)
    `
    )
    .eq("stage_id", stage.id)
    .order("tour_id", { ascending: true })
    .order("kickoff_at", { ascending: true });

  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: preds } = await supabase
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds);

  // для подсветки "нет вашего прогноза"
  const myPredMatchIds = new Set<number>();
  for (const p of preds ?? []) {
    if (p.user_id === me.id) myPredMatchIds.add(Number(p.match_id));
  }

  // предсказания по сетке
  const predMap = new Map<string, string>();
  for (const p of preds ?? []) {
    const l = userIdToLogin.get(p.user_id);
    if (l) predMap.set(`${p.match_id}::${l}`, `${p.home_pred}:${p.away_pred}`);
  }

  // начисления
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

  const gridCols = `minmax(260px, 1.6fr) 80px repeat(${logins.length}, minmax(140px, 1fr))`;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 900 }}>Текущая таблица — {stage.name}</div>

      <div style={{ marginTop: 16, border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
        {/* header */}
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

                const missingMyPred = myLogin ? !myPredMatchIds.has(Number(m.id)) : false;

                // canEdit: не locked, дедлайн не прошёл
                const deadlineOk = m.deadline_at ? Date.now() <= new Date(m.deadline_at).getTime() : true;
                const canEdit = !!myLogin && !stageLocked && deadlineOk;

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
                      background: missingMyPred ? "rgba(234,179,8,0.12)" : "transparent",
                    }}
                  >
                    {/* Матч + бейдж */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <b>{m.stage_match_no}.</b>{" "}
                        {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                      </div>

                      {missingMyPred ? (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(234,179,8,0.45)",
                            background: "rgba(234,179,8,0.18)",
                            fontSize: 12,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                          }}
                        >
                          нет вашего прогноза
                        </span>
                      ) : null}
                    </div>

                    <div style={{ textAlign: "center", fontWeight: 900 }}>{result}</div>

                    {/* Колонки участников */}
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

                      const exact = isExactPred(pred, m.home_score, m.away_score);

                      // ✅ ТОЛЬКО моя колонка редактируемая
                      if (myLogin && l === myLogin) {
                        const pointsText = typeof pts === "number" ? ` (${fmt(pts)})` : "";

                        return (
                          <div key={l} style={{ minHeight: 26 }}>
                            <PredCellEditable
                              matchId={m.id}
                              pred={pred}
                              canEdit={canEdit}
                              pointsText={pointsText}
                              // если компонент не использует — не страшно
                            />
                            {tip ? <PointsPopover tip={tip} /> : null}
                          </div>
                        );
                      }

                      return (
                        <div key={l} style={{ minHeight: 26 }}>
                          <span style={cellStyleExact(exact)}>
                            {/* 🎯 только для 100% */}
                            {exact ? <span aria-label="точно" title="Точное попадание">🎯</span> : null}
                            <span>{pred}</span>
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
    </main>
  );
}
