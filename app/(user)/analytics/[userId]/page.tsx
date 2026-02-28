import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

type Props = { params: Promise<{ userId: string }> };
type StageRow = { id: number; name: string; status?: string | null };

type AggRow = {
  stage_id: number;
  user_id: string;
  matches_count: number;

  points_sum: number;
  points_avg: number;

  exact_count: number;
  outcome_hit_count: number;
  diff_hit_count: number;
};

type MomRow = {
  stage_id: number;
  user_id: string;
  matches_count: number;
  momentum_current: number;
  momentum_series: any;
  avg_last_n: number;
  avg_all: number;
  n: number;
  k: number;
  updated_at: string;
};

type ArchRow = {
  stage_id: number;
  user_id: string;
  archetype_key: string;
  title_ru: string;
  summary_ru: string;
  state: string;
  updated_at: string;
};

const TIP = {
  points: "Сколько очков вы набрали за учтённые матчи этапа.",
  avgPoints:
    "Среднее число очков за один учтённый матч. Удобно сравнивать, если у людей разное число матчей.",
  outcome:
    "Как часто вы угадываете победу/ничью/поражение (1/X/2), даже если точный счёт не совпал.",
  diff:
    "Как часто вы угадываете разницу мячей (например 2:1 и 3:2 — обе разница +1).",
  exact: "Как часто вы угадываете точный счёт.",
  form:
    "Показывает, стали ли последние матчи лучше вашего среднего уровня. Плюс — вы набираете больше обычного, минус — меньше.",
  spark:
    "Очки по матчам подряд (слева старее → справа новее). Видно серии и провалы.",
  archetype:
    "Ваш стиль прогнозов. Это про манеру, а не про “сильнее/слабее”.",
  pointsCheck:
    "Проверка: сравниваем “Очки” со суммой очков по матчам. Если есть ⚠️ — значит где-то ещё не обновилось или есть расхождение в учёте матчей.",
};

function pct(a: number, b: number) {
  if (!b) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}
function n2(v: number) {
  return (Math.round(v * 100) / 100).toFixed(2);
}
function sumNums(arr: number[]) {
  return (arr ?? []).reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
}

function Sparkline({ values }: { values: number[] }) {
  const W = 240;
  const H = 52;
  const pad = 3;

  const vals = (values ?? []).slice(-12);
  if (vals.length < 2) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path d={`M${pad} ${H - pad} L${W - pad} ${H - pad}`} stroke="rgba(17,24,39,.16)" fill="none" />
      </svg>
    );
  }

  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const dx = (W - pad * 2) / (vals.length - 1);

  const pts = vals.map((v, i) => {
    const x = pad + i * dx;
    const t = (v - min) / (max - min);
    const y = pad + (1 - t) * (H - pad * 2);
    return [x, y] as const;
  });

  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Очки по матчам">
      <path d={d} stroke="rgba(37,99,235,.85)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default async function AnalyticsUserPage({ params }: Props) {
  const sb = service();
  const { userId } = await params;

  const { data: account } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .eq("user_id", userId)
    .maybeSingle();

  if (!account) notFound();

  const { data: profile } = await sb.from("profiles").select("display_name").eq("id", userId).maybeSingle();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle<StageRow>();

  if (!stage?.id) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Текущий этап не выбран.</p>
        <div style={{ marginTop: 14 }}>
          <Link href="/analytics" className="navLink">← Назад</Link>
        </div>
      </div>
    );
  }

  const stageId = Number(stage.id);

  const name =
    (profile?.display_name ?? "").trim() ||
    (account.login ?? "").trim() ||
    userId.slice(0, 8);

  const { data: agg } = await sb
    .from("analytics_stage_user")
    .select("stage_id,user_id,matches_count,points_sum,points_avg,exact_count,outcome_hit_count,diff_hit_count")
    .eq("stage_id", stageId)
    .eq("user_id", userId)
    .maybeSingle<AggRow>();

  const { data: mom } = await sb
    .from("analytics_stage_user_momentum")
    .select("stage_id,user_id,matches_count,momentum_current,momentum_series,avg_last_n,avg_all,n,k,updated_at")
    .eq("stage_id", stageId)
    .eq("user_id", userId)
    .maybeSingle<MomRow>();

  const { data: arch } = await sb
    .from("analytics_stage_user_archetype")
    .select("stage_id,user_id,archetype_key,title_ru,summary_ru,state,updated_at")
    .eq("stage_id", stageId)
    .eq("user_id", userId)
    .maybeSingle<ArchRow>();

  const matches = Number(agg?.matches_count ?? 0);
  const pointsSum = Number(agg?.points_sum ?? 0);
  const avgPoints = matches ? pointsSum / matches : 0;

  const seriesRaw = mom?.momentum_series ?? [];
  const series = Array.isArray(seriesRaw) ? seriesRaw.map((x: any) => Number(x ?? 0)) : [];
  const seriesSum = sumNums(series);

  const mismatch = series.length ? Math.abs(pointsSum - seriesSum) > 0.01 : false;

  const updated = (arch?.updated_at || mom?.updated_at)
    ? new Date((arch?.updated_at ?? mom?.updated_at) as string).toLocaleString("ru-RU")
    : "—";

  return (
    <div className="page">
      <h1>{name}</h1>

      <div className="pageMeta">
        Этап: <b>{stage.name}</b>
        {stage.status ? <span> · {stage.status}</span> : null}
        <span> · обновлено: <b>{updated}</b></span>
      </div>

      <details className="helpBox" style={{ marginTop: 10 }}>
        <summary className="helpSummary">Пояснения (что означает и как читать)</summary>
        <div className="helpBody">
          <ul className="helpList">
            <li><b>Очки</b> — {TIP.points}</li>
            <li><b>Средние очки</b> — {TIP.avgPoints}</li>
            <li><b>Исход %</b> — {TIP.outcome}</li>
            <li><b>Разница %</b> — {TIP.diff}</li>
            <li><b>Точный %</b> — {TIP.exact}</li>
            <li><b>Форма</b> — {TIP.form}</li>
            <li><b>График</b> — {TIP.spark}</li>
            <li><b>Архетип</b> — {TIP.archetype}</li>
          </ul>
        </div>
      </details>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardBody">
          <div className="kpiRow">
            <div className="kpi" title="Сколько матчей учтено для вас">
              <div className="kpiLabel">Матчей</div>
              <div className="kpiValue">{matches}</div>
            </div>

            <div className="kpi" title={TIP.points}>
              <div className="kpiLabel">Очки</div>
              <div className="kpiValue">{n2(pointsSum)}</div>
            </div>

            <div className="kpi" title={TIP.avgPoints}>
              <div className="kpiLabel">Средние очки</div>
              <div className="kpiValue">{n2(avgPoints)}</div>
            </div>

            <div className="kpi" title={TIP.outcome}>
              <div className="kpiLabel">Исход</div>
              <div className="kpiValue">{pct(Number(agg?.outcome_hit_count ?? 0), matches)}</div>
            </div>

            <div className="kpi" title={TIP.diff}>
              <div className="kpiLabel">Разница</div>
              <div className="kpiValue">{pct(Number(agg?.diff_hit_count ?? 0), matches)}</div>
            </div>

            <div className="kpi" title={TIP.exact}>
              <div className="kpiLabel">Точный</div>
              <div className="kpiValue">{pct(Number(agg?.exact_count ?? 0), matches)}</div>
            </div>
          </div>

          <div style={{ marginTop: 10, opacity: 0.85 }} title={TIP.pointsCheck}>
            {mismatch ? (
              <span style={{ fontWeight: 900 }}>⚠️ проверка очков по матчам: {n2(seriesSum)}</span>
            ) : (
              <span>проверка очков по матчам: {n2(seriesSum)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardBody">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <div style={{ fontWeight: 950 }} title={TIP.spark}>Форма (очки по матчам)</div>
            <div style={{ opacity: 0.78 }}>
              среднее: <b>{n2(Number(mom?.avg_all ?? 0))}</b> · последние {mom?.n ?? 5}:{" "}
              <b>{n2(Number(mom?.avg_last_n ?? 0))}</b> · форма:{" "}
              <b>{(Number(mom?.momentum_current ?? 0) >= 0 ? "+" : "") + n2(Number(mom?.momentum_current ?? 0))}</b>
            </div>
          </div>

          <div style={{ marginTop: 10 }} title={TIP.spark}>
            <Sparkline values={series} />
          </div>

          {arch ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 950 }} title={TIP.archetype}>
                Архетип: {arch.title_ru}
                {arch.state === "preliminary" ? <span style={{ opacity: 0.7, marginLeft: 8 }}>· предвар.</span> : null}
                {arch.state === "final" ? <span style={{ opacity: 0.7, marginLeft: 8 }}>· финал</span> : null}
              </div>
              <div style={{ opacity: 0.85, marginTop: 6 }}>{arch.summary_ru}</div>
            </div>
          ) : null}
        </div>
      </div>

      {mismatch ? (
        <div className="analyticsHintSmall" style={{ marginTop: 10 }} title={TIP.pointsCheck}>
          ⚠️ Есть расхождение “Очки” и “проверка очков по матчам”. Обычно помогает повторный пересчёт последнего матча
          (в админке через “Счёт”).
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <Link href="/analytics" className="navLink">← Назад к списку</Link>
      </div>
    </div>
  );
}