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

type MatchRow = {
  id: number;
  stage_id: number;
  stage_match_no: number | null;
  kickoff_at: string | null;
  deadline_at: string | null;
  status: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  home_score: number | null;
  away_score: number | null;
};

type PredRow = {
  match_id: number;
  home_pred: number | null;
  away_pred: number | null;
};

type StageRow = { id: number; name: string };

type LoginAccountRow = { user_id: string; login: string };

function fmtDateTimeRu(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hoursUntil(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const now = Date.now();
  return (t - now) / 36e5;
}

function hasFullPrediction(p?: PredRow | null) {
  return p?.home_pred != null && p?.away_pred != null;
}

export default async function DashboardPage() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();

  if (!login) redirect("/");

  const sb = service();

  // 1) Найдём user_id по логину
  const { data: acc, error: aErr } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .eq("login", login)
    .maybeSingle<LoginAccountRow>();

  if (aErr) {
    return (
      <div className="page">
        <h1>Таблица</h1>
        <p>Ошибка загрузки логина: {aErr.message}</p>
      </div>
    );
  }

  if (!acc?.user_id) {
    redirect("/");
  }

  const userId = acc.user_id;

  // 2) Текущий этап
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

  // 3) Матчи этапа (можешь ограничить ближайшими — тут выводим все по kickoff_at)
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
    .order("kickoff_at", { ascending: true, nullsFirst: false })
    .order("stage_match_no", { ascending: true, nullsFirst: false });

  if (mErr) {
    return (
      <div className="page">
        <h1>Таблица</h1>
        <p>Ошибка загрузки матчей: {mErr.message}</p>
      </div>
    );
  }

  const matchRows = (matches ?? []) as MatchRow[];
  const matchIds = matchRows.map((x) => Number(x.id)).filter((x) => Number.isFinite(x));

  // 4) Прогнозы пользователя по этим матчам
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

  const predByMatch = new Map<number, PredRow>();
  for (const p of (preds ?? []) as any[]) {
    predByMatch.set(Number(p.match_id), {
      match_id: Number(p.match_id),
      home_pred: p.home_pred == null ? null : Number(p.home_pred),
      away_pred: p.away_pred == null ? null : Number(p.away_pred),
    });
  }

  return (
    <div className="page">
      <h1>Таблица</h1>
      <div className="pageMeta">
        Этап: <b>{stage.name}</b>
      </div>

      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>№</th>
              <th style={{ width: 200 }}>Дата/время</th>
              <th>Матч</th>
              <th style={{ width: 140 }}>Мой прогноз</th>
              <th style={{ width: 120 }}>Результат</th>
            </tr>
          </thead>

          <tbody>
            {matchRows.map((m) => {
              const mid = Number(m.id);
              const pred = predByMatch.get(mid) ?? null;

              // ✅ (ПУНКТ 1) Предупреждение показываем ТОЛЬКО если прогноза нет/неполный
              const predicted = hasFullPrediction(pred);

              // ориентируемся по deadline_at (если есть), иначе kickoff_at
              const refIso = m.deadline_at ?? m.kickoff_at;
              const h = hoursUntil(refIso);

              const isFuture = h != null ? h > 0 : false;
              const isSoon = isFuture && h != null && h <= 24;
              const isUrgent = isFuture && h != null && h <= 6;

              const showWarn = !predicted && (isUrgent || isSoon);

              const rowCls = isUrgent ? "rowUrgent" : isSoon ? "rowSoon" : "";

              const predText = predicted
                ? `${pred!.home_pred}:${pred!.away_pred}`
                : pred?.home_pred != null && pred?.away_pred != null
                ? `${pred.home_pred}:${pred.away_pred}`
                : "—";

              const resText =
                m.home_score != null && m.away_score != null ? `${m.home_score}:${m.away_score}` : "—";

              return (
                <tr key={m.id} className={rowCls}>
                  <td className="mono">{m.stage_match_no ?? m.id}</td>

                  <td>
                    <div className="mono">{fmtDateTimeRu(m.kickoff_at)}</div>
                    {m.deadline_at ? (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Дедлайн: {fmtDateTimeRu(m.deadline_at)}
                      </div>
                    ) : null}

                    {showWarn ? (
                      <div className="rowWarn">Скоро матч — сделай прогноз</div>
                    ) : null}
                  </td>

                  <td style={{ fontWeight: 900 }}>
                    {m.home_team?.name ?? "—"} <span style={{ opacity: 0.6 }}>—</span>{" "}
                    {m.away_team?.name ?? "—"}
                  </td>

                  <td>
                    <span className="mono" style={{ fontWeight: 900 }}>
                      {predText}
                    </span>
                  </td>

                  <td>
                    <span className="mono" style={{ fontWeight: 900 }}>
                      {resText}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="navRow">
        <Link href="/dashboard/current" className="navLink">
          Текущая таблица
        </Link>
        <Link href="/analytics" className="navLink">
          Аналитика
        </Link>
      </div>
    </div>
  );
}