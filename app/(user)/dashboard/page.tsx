// app/(user)/dashboard/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

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

type StageRow = { id: number; name: string | null };

type MatchRow = {
  id: number;
  stage_id: number;
  stage_match_no: number | null;
  kickoff_at: string | null;
  deadline_at: string | null;
  status: string | null;
  home_score: number | null;
  away_score: number | null;

  // ⚠️ Supabase embed здесь типизируется как массив
  home_team?: { name: string }[] | null;
  away_team?: { name: string }[] | null;
};

type PredRow = {
  match_id: number;
  home_pred: number | null;
  away_pred: number | null;
};

function isoToDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Amsterdam" });
}

function isoToTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSoon(deadlineIso?: string | null) {
  if (!deadlineIso) return false;
  const d = new Date(deadlineIso).getTime();
  const now = Date.now();
  const diffMs = d - now;
  // "скоро" = меньше 24 часов до дедлайна
  return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
}

export default async function UserDashboardPage() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!login) redirect("/");

  const sb = service();

  // 1) user_id по логину
  const { data: acc, error: accErr } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .eq("login", login)
    .maybeSingle();

  if (accErr) {
    return (
      <div className="page">
        <h1>Таблица</h1>
        <p>Ошибка загрузки аккаунта: {accErr.message}</p>
      </div>
    );
  }
  if (!acc?.user_id) redirect("/");

  const userId = String(acc.user_id);

  // 2) текущий этап
  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("id,name")
    .eq("is_current", true)
    .maybeSingle<StageRow>();

  if (sErr) {
    return (
      <div className="page">
        <h1>Таблица</h1>
        <p>Ошибка загрузки этапа: {sErr.message}</p>
      </div>
    );
  }

  if (!stage?.id) {
    return (
      <div className="page">
        <h1>Таблица</h1>
        <p>Текущий этап не выбран.</p>
      </div>
    );
  }

  const stageId = Number(stage.id);

  // 3) матчи (например ближайшие 20 в этапе)
  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id,
      stage_id,
      stage_match_no,
      kickoff_at,
      deadline_at,
      status,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stageId)
    .order("kickoff_at", { ascending: true })
    .order("stage_match_no", { ascending: true })
    .limit(20);

  if (mErr) {
    return (
      <div className="page">
        <h1>Таблица</h1>
        <p>Ошибка загрузки матчей: {mErr.message}</p>
      </div>
    );
  }

  const matchRows = (matches ?? []) as unknown as MatchRow[];
  const matchIds = matchRows
    .map((x) => Number(x.id))
    .filter((x) => Number.isFinite(x) && x > 0);

  // 4) прогнозы пользователя по этим матчам
  const predByMatch = new Map<number, { home: number | null; away: number | null }>();

  if (matchIds.length > 0) {
    const { data: preds, error: pErr } = await sb
      .from("predictions")
      .select("match_id,home_pred,away_pred")
      .eq("user_id", userId)
      .in("match_id", matchIds);

    if (pErr) {
      return (
        <div className="page">
          <h1>Таблица</h1>
          <p>Ошибка загрузки прогнозов: {pErr.message}</p>
        </div>
      );
    }

    for (const p of (preds ?? []) as PredRow[]) {
      predByMatch.set(Number(p.match_id), {
        home: p.home_pred ?? null,
        away: p.away_pred ?? null,
      });
    }
  }

  return (
    <div className="page">
      <h1>Таблица</h1>

      <div className="pageMeta">
        Этап: <b>{stage.name ?? "—"}</b>
      </div>

      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>№</th>
              <th style={{ width: 160 }}>Дата / Время</th>
              <th>Матч</th>
              <th style={{ width: 180 }}>Мой прогноз</th>
              <th style={{ width: 180 }}>Статус</th>
            </tr>
          </thead>

          <tbody>
            {matchRows.map((m) => {
              const mid = Number(m.id);

              const ht = (m.home_team?.[0]?.name ?? "").trim();
              const at = (m.away_team?.[0]?.name ?? "").trim();
              const teamsText = ht && at ? `${ht} — ${at}` : `Match #${mid}`;

              const pred = predByMatch.get(mid);
              const hasPred =
                pred != null &&
                pred.home != null &&
                pred.away != null;

              const date = isoToDate(m.kickoff_at);
              const time = isoToTime(m.kickoff_at);

              const soon = isSoon(m.deadline_at);
              const showSoonHint = soon && !hasPred; // ✅ ВАЖНО: только если прогноза нет

              return (
                <tr key={mid}>
                  <td>{m.stage_match_no ?? "—"}</td>

                  <td>
                    <div style={{ fontWeight: 900 }}>
                      {date}
                      {time ? <span style={{ opacity: 0.7 }}> · {time}</span> : null}
                    </div>
                    {m.deadline_at ? (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        дедлайн: {isoToDate(m.deadline_at)} {isoToTime(m.deadline_at)}
                      </div>
                    ) : null}
                  </td>

                  <td style={{ fontWeight: 900 }}>{teamsText}</td>

                  <td>
                    {hasPred ? (
                      <span style={{ fontWeight: 900 }}>
                        {pred!.home}:{pred!.away}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.7, fontWeight: 800 }}>—</span>
                    )}
                  </td>

                  <td>
                    <div style={{ fontWeight: 800, opacity: 0.85 }}>
                      {m.status ?? "—"}
                      {m.home_score != null && m.away_score != null ? (
                        <span style={{ marginLeft: 8, opacity: 0.8 }}>
                          ({m.home_score}:{m.away_score})
                        </span>
                      ) : null}
                    </div>

                    {showSoonHint ? (
                      <div className="rowWarn">Скоро матч — сделай прогноз</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="navRow">
        <Link className="navLink" href="/dashboard/matches">
          Перейти к прогнозам
        </Link>
        <Link className="navLink" href="/dashboard/current">
          Текущая таблица
        </Link>
      </div>
    </div>
  );
}