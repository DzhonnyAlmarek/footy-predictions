import Link from "next/link";
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

type StageRow = { id: number; name: string; status?: string | null };
type LoginAccountRow = { user_id: string; login: string };
type ProfileRow = { id: string; display_name: string | null };

type AggRow = {
  stage_id: number;
  user_id: string;
  matches_count: number;

  points_sum: number;
  points_avg: number;

  exact_count: number;
  outcome_hit_count: number;
  diff_hit_count: number;

  pred_home_count: number;
  pred_draw_count: number;
  pred_away_count: number;

  pred_total_sum: number;
  pred_absdiff_sum: number;
  pred_bigdiff_count: number;
};

type ArchRow = {
  stage_id: number;
  user_id: string;
  archetype_key: string;
  title_ru: string;
  summary_ru: string;
  state: "forming" | "preliminary" | "final";
  updated_at: string;
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

type BaselineRow = { stage_id: number; users_count: number; updated_at: string };

type SearchParams = { sort?: string; mode?: string };
type Props = { searchParams?: Promise<SearchParams> };

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}
function pct01(v: number) {
  return `${Math.round(v * 100)}%`;
}
function n2(v: number) {
  return (Math.round(v * 100) / 100).toFixed(2);
}
function archetypeIcon(key: string): string {
  switch (key) {
    case "sniper":
      return "🏹";
    case "peacekeeper":
      return "🤝";
    case "risky":
      return "🔥";
    case "rational":
      return "🧠";
    case "forming":
      return "⏳";
    default:
      return "⚽";
  }
}
function badgeClassByKey(key: string) {
  switch (key) {
    case "sniper":
      return "badge isOk";
    case "peacekeeper":
      return "badge isInfo";
    case "risky":
      return "badge isWarn";
    case "rational":
      return "badge isInfo";
    case "forming":
    default:
      return "badge isNeutral";
  }
}

function Sparkline({ values }: { values: number[] }) {
  const W = 150;
  const H = 34;
  const pad = 2;

  const vals = (values ?? []).slice(-10);
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
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Форма (очки по матчам)">
      <path d={d} stroke="rgba(37,99,235,.85)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const sb = service();
  const sp = (searchParams ? await searchParams : {}) as SearchParams;

  const sort = (sp.sort ?? "ppm").toLowerCase(); // ppm|points|matches|outcome|diff|exact|name
  const mode = (sp.mode ?? "compact").toLowerCase() === "details" ? "details" : "compact";

  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle<StageRow>();

  if (sErr) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Ошибка загрузки этапа: {sErr.message}</p>
      </div>
    );
  }
  if (!stage?.id) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Текущий этап не выбран.</p>
      </div>
    );
  }

  const stageId = Number(stage.id);

  const { data: baseline } = await sb
    .from("analytics_stage_baseline")
    .select("stage_id,users_count,updated_at")
    .eq("stage_id", stageId)
    .maybeSingle<BaselineRow>();

  const { data: accounts } = await sb.from("login_accounts").select("user_id,login").not("user_id", "is", null);

  const realAccounts = ((accounts ?? []) as LoginAccountRow[]).filter(
    (a) => String(a.login ?? "").trim().toUpperCase() !== "ADMIN"
  );

  const userIds = Array.from(new Set(realAccounts.map((a) => a.user_id)));
  if (!userIds.length) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Нет участников для отображения.</p>
      </div>
    );
  }

  const { data: profiles } = await sb.from("profiles").select("id,display_name").in("id", userIds);
  const profMap = new Map<string, ProfileRow>();
  for (const p of (profiles ?? []) as ProfileRow[]) profMap.set(p.id, p);

  const { data: aggRows } = await sb
    .from("analytics_stage_user")
    .select(
      "stage_id,user_id,matches_count,points_sum,points_avg,exact_count,outcome_hit_count,diff_hit_count,pred_home_count,pred_draw_count,pred_away_count,pred_total_sum,pred_absdiff_sum,pred_bigdiff_count"
    )
    .eq("stage_id", stageId)
    .in("user_id", userIds);

  const { data: momRows } = await sb
    .from("analytics_stage_user_momentum")
    .select("stage_id,user_id,matches_count,momentum_current,momentum_series,avg_last_n,avg_all,n,k,updated_at")
    .eq("stage_id", stageId)
    .in("user_id", userIds);

  const { data: archRows } = await sb
    .from("analytics_stage_user_archetype")
    .select("stage_id,user_id,archetype_key,title_ru,summary_ru,state,updated_at")
    .eq("stage_id", stageId)
    .in("user_id", userIds);

  const aggMap = new Map<string, AggRow>();
  for (const a of (aggRows ?? []) as any[]) aggMap.set(a.user_id, a as AggRow);

  const momMap = new Map<string, MomRow>();
  for (const m of (momRows ?? []) as any[]) momMap.set(m.user_id, m as MomRow);

  const archMap = new Map<string, ArchRow>();
  for (const a of (archRows ?? []) as any[]) archMap.set(a.user_id, a as ArchRow);

  const cards = userIds.map((uid) => {
    const acc = realAccounts.find((a) => a.user_id === uid);
    const prof = profMap.get(uid);
    const agg = aggMap.get(uid);
    const mom = momMap.get(uid);
    const arch = archMap.get(uid);

    const name = (prof?.display_name ?? "").trim() || (acc?.login ?? "").trim() || uid.slice(0, 8);

    const matches = agg?.matches_count ?? 0;
    const pointsSum = Number(agg?.points_sum ?? 0);
    const ppm = matches ? pointsSum / matches : 0;

    const exactRate = safeDiv(agg?.exact_count ?? 0, matches);
    const outcomeRate = safeDiv(agg?.outcome_hit_count ?? 0, matches);
    const diffRate = safeDiv(agg?.diff_hit_count ?? 0, matches);

    const seriesRaw = mom?.momentum_series ?? [];
    const series = Array.isArray(seriesRaw) ? seriesRaw.map((x: any) => Number(x ?? 0)) : [];

    const archetype_key = arch?.archetype_key ?? "forming";
    const title_ru = arch?.title_ru ?? "Формируется";
    const summary_ru = arch?.summary_ru ?? "Пока мало данных для стиля.";
    const state = (arch?.state ?? "forming") as ArchRow["state"];

    return {
      uid,
      name,
      matches,
      pointsSum,
      ppm,
      exactRate,
      outcomeRate,
      diffRate,
      series,
      momentum: Number(mom?.momentum_current ?? 0),
      archetype_key,
      title_ru,
      summary_ru,
      state,
    };
  });

  const sorted = [...cards].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "matches") return b.matches - a.matches;
    if (sort === "points") return b.pointsSum - a.pointsSum;
    if (sort === "exact") return b.exactRate - a.exactRate;
    if (sort === "outcome") return b.outcomeRate - a.outcomeRate;
    if (sort === "diff") return b.diffRate - a.diffRate;
    // default ppm
    return b.ppm - a.ppm;
  });

  const updated = baseline?.updated_at ? new Date(baseline.updated_at).toLocaleString("ru-RU") : "—";
  const usersCount = baseline?.users_count ?? userIds.length;

  const q = (p: Partial<SearchParams>) => {
    const s = new URLSearchParams();
    s.set("sort", p.sort ?? sort);
    s.set("mode", p.mode ?? mode);
    return `/analytics?${s.toString()}`;
  };

  return (
    <div className="page">
      <div className="analyticsHead">
        <div>
          <h1>Аналитика</h1>
          <div className="pageMeta">
            Этап: <b>{stage.name}</b>
            {stage.status ? <span> · {stage.status}</span> : null}
            <span> · обновлено: <b>{updated}</b></span>
          </div>
        </div>

        <div className="analyticsControls">
          <Link href={q({ mode: "compact" })} className={`appNavLink ${mode === "compact" ? "navActive" : ""}`}>
            Коротко
          </Link>
          <Link href={q({ mode: "details" })} className={`appNavLink ${mode === "details" ? "navActive" : ""}`}>
            Подробнее
          </Link>

          <Link href={q({ sort: "ppm" })} className="appNavLink">Сорт: Очки/матч</Link>
          <Link href={q({ sort: "points" })} className="appNavLink">Очки</Link>
          <Link href={q({ sort: "matches" })} className="appNavLink">Матчи</Link>
          <Link href={q({ sort: "outcome" })} className="appNavLink">Исход%</Link>
          <Link href={q({ sort: "diff" })} className="appNavLink">Разн.%</Link>
          <Link href={q({ sort: "exact" })} className="appNavLink">Точный%</Link>
          <Link href={q({ sort: "name" })} className="appNavLink">Имя</Link>
        </div>
      </div>

      <div className="analyticsSummary" style={{ marginTop: 14 }}>
        <div className="card analyticsSummaryCard">
          <div className="analyticsSummaryInner" title="Сколько участников (без ADMIN)">
            <div className="analyticsSummaryLabel">Участников</div>
            <div className="analyticsSummaryValue">{usersCount}</div>
          </div>
        </div>

        <div className="card analyticsSummaryCard">
          <div className="analyticsSummaryInner" title="Режим страницы">
            <div className="analyticsSummaryLabel">Режим</div>
            <div className="analyticsSummaryValue">{mode === "compact" ? "Коротко" : "Подробнее"}</div>
          </div>
        </div>
      </div>

      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table className="table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th className="thLeft">Участник</th>
              <th className="thCenter" style={{ width: 90 }}>Матчи</th>
              <th className="thCenter" style={{ width: 110 }}>Очки</th>
              <th className="thCenter" style={{ width: 120 }}>Очки/матч</th>
              <th className="thCenter" style={{ width: 110 }}>Исход</th>
              <th className="thCenter" style={{ width: 110 }}>Разница</th>
              <th className="thCenter" style={{ width: 110 }}>Точный</th>
              <th className="thCenter" style={{ width: 220 }}>Архетип</th>
              {mode === "details" ? <th className="thCenter" style={{ width: 170 }}>Форма</th> : null}
            </tr>
          </thead>

          <tbody>
            {sorted.map((c) => {
              const icon = archetypeIcon(c.archetype_key);
              return (
                <tr key={c.uid}>
                  <td className="tdLeft">
                    <div style={{ fontWeight: 950 }}>
                      <Link href={`/analytics/${c.uid}`}>{c.name}</Link>
                    </div>
                    {mode === "details" ? (
                      <div style={{ marginTop: 6, opacity: 0.78 }}>
                        {c.summary_ru}
                      </div>
                    ) : null}
                  </td>

                  <td className="tdCenter">
                    <span className="badge isNeutral">{c.matches}</span>
                  </td>

                  <td className="tdCenter">
                    <b>{n2(c.pointsSum)}</b>
                  </td>

                  <td className="tdCenter">
                    <b>{n2(c.ppm)}</b>
                  </td>

                  <td className="tdCenter"><b>{pct01(c.outcomeRate)}</b></td>
                  <td className="tdCenter"><b>{pct01(c.diffRate)}</b></td>
                  <td className="tdCenter"><b>{pct01(c.exactRate)}</b></td>

                  <td className="tdCenter">
                    <span className={badgeClassByKey(c.archetype_key)} title={c.summary_ru}>
                      <span aria-hidden="true">{icon}</span> {c.title_ru}
                    </span>
                  </td>

                  {mode === "details" ? (
                    <td className="tdCenter" title="Очки по матчам (последние 10)">
                      <Sparkline values={c.series} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link href="/dashboard" className="navLink">← Назад</Link>
      </div>
    </div>
  );
}