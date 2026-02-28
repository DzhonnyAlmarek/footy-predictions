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

/* ---------------- helpers ---------------- */

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

/* ---------- tooltips text (single source of truth) ---------- */

const TIP = {
  updated:
    "Дата обновления — когда последний раз пересчитывали analytics_* таблицы. Пересчёт запускается после нажатия «Счёт» по матчу.",
  matches:
    "Матчи — сколько завершённых матчей этапа вошло в расчёт для участника. Учитываются только матчи со status='finished' и заполненным счётом, и только заполненные прогнозы.",
  points:
    "Очки — сумма points_ledger.points по матчам этого этапа, где reason='prediction'.",
  ppm:
    "Очки/матч = Очки / Матчи. Это самый честный показатель, когда у людей разное число учтённых матчей.",
  outcome:
    "Исход % — доля матчей, где угадан 1/X/2 (П1/Н/П2). Считается по sign(home_pred-away_pred) == sign(home_score-away_score).",
  diff:
    "Разница % — доля матчей, где угадана разница голов: (home_pred-away_pred) == (home_score-away_score).",
  exact:
    "Точный % — доля матчей, где прогноз полностью совпал со счётом: home_pred=home_score и away_pred=away_score.",
  form:
    "Форма — (средние очки за последние 5 матчей) − (средние очки за весь этап). Плюс значит: последние матчи лучше среднего.",
  spark:
    "График формы — очки по матчам (из points_ledger) в хронологическом порядке. Показываем последние 10 значений.",
  archetype:
    "Архетип — стиль прогнозов. Мы смотрим на частоту ничьих, среднюю разницу в прогнозах, «смелость» (частые большие разницы), и частоту точных попаданий. Это не про «сильнее/слабее», а про манеру.",
  top:
    "TOP считается только среди участников, у кого учтено минимум матчей (порог указан рядом).",
};

/* ---------- tiny UI helpers ---------- */

function ThHelp(props: { label: string; tip: string }) {
  return (
    <span className="thHelp" title={props.tip}>
      {props.label} <span className="thHelpIcon" aria-hidden="true">ℹ️</span>
    </span>
  );
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

function TopMiniCard(props: {
  title: string;
  name: string;
  value: string;
  meta: string;
  tip: string;
  href?: string;
}) {
  const body = (
    <div className="card analyticsTopCard" title={props.tip}>
      <div className="analyticsTopCardInner">
        <div className="analyticsTopTitle">{props.title}</div>
        <div className="analyticsTopName">{props.name}</div>
        <div className="analyticsTopBottom">
          <div className="analyticsTopValue">{props.value}</div>
          <div className="analyticsTopMeta">{props.meta}</div>
        </div>
      </div>
    </div>
  );

  return props.href ? (
    <Link href={props.href} style={{ textDecoration: "none", color: "inherit" }}>
      {body}
    </Link>
  ) : (
    body
  );
}

/* ---------------- main ---------------- */

export default async function AnalyticsPage({ searchParams }: Props) {
  const sb = service();
  const sp = (searchParams ? await searchParams : {}) as SearchParams;

  const sort = (sp.sort ?? "ppm").toLowerCase(); // ppm|points|matches|outcome|diff|exact|name|form
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

  const { data: accounts } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .not("user_id", "is", null);

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

    const momentum = Number(mom?.momentum_current ?? 0);

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
      momentum,
      archetype_key,
      title_ru,
      summary_ru,
      state,
    };
  });

  // TOP (честность): только у кого матчей достаточно
  const MIN_TOP_MATCHES = 3;
  const withEnough = cards.filter((c) => c.matches >= MIN_TOP_MATCHES);

  const pickTop = <T,>(arr: T[], score: (x: any) => number) =>
    [...arr].sort((a: any, b: any) => score(b) - score(a) || (b.matches ?? 0) - (a.matches ?? 0))[0] ?? null;

  const topPPM = withEnough.length ? pickTop(withEnough, (c) => c.ppm) : null;
  const topForm = withEnough.length ? pickTop(withEnough, (c) => c.momentum) : null;
  const topPoints = withEnough.length ? pickTop(withEnough, (c) => c.pointsSum) : null;

  const topOutcome = withEnough.length ? pickTop(withEnough, (c) => c.outcomeRate) : null;
  const topDiff = withEnough.length ? pickTop(withEnough, (c) => c.diffRate) : null;
  const topExact = withEnough.length ? pickTop(withEnough, (c) => c.exactRate) : null;

  const sorted = [...cards].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "matches") return b.matches - a.matches;
    if (sort === "points") return b.pointsSum - a.pointsSum;
    if (sort === "exact") return b.exactRate - a.exactRate;
    if (sort === "outcome") return b.outcomeRate - a.outcomeRate;
    if (sort === "diff") return b.diffRate - a.diffRate;
    if (sort === "form") return b.momentum - a.momentum;
    return b.ppm - a.ppm; // ppm default
  });

  const updated = baseline?.updated_at ? new Date(baseline.updated_at).toLocaleString("ru-RU") : "—";
  const usersCount = baseline?.users_count ?? userIds.length;

  const q = (p: Partial<SearchParams>) => {
    const s = new URLSearchParams();
    s.set("sort", p.sort ?? sort);
    s.set("mode", p.mode ?? mode);
    return `/analytics?${s.toString()}`;
  };

  function fmtMomentum(m: number, matches: number) {
    if (matches < MIN_TOP_MATCHES) return "н/д";
    const arrow = m > 0.02 ? "↗" : m < -0.02 ? "↘" : "→";
    const sign = m >= 0 ? "+" : "";
    return `${sign}${n2(m)} ${arrow}`;
  }

  return (
    <div className="page">
      <div className="analyticsHead">
        <div>
          <h1>Аналитика</h1>
          <div className="pageMeta" title={TIP.updated}>
            Этап: <b>{stage.name}</b>
            {stage.status ? <span> · {stage.status}</span> : null}
            <span> · обновлено: <b>{updated}</b></span>
          </div>

          <details className="helpBox" style={{ marginTop: 10 }}>
            <summary className="helpSummary">Пояснения (как читаем и как считается)</summary>
            <div className="helpBody">
              <ul className="helpList">
                <li><b>Матчи</b>: {TIP.matches}</li>
                <li><b>Очки</b>: {TIP.points}</li>
                <li><b>Очки/матч</b>: {TIP.ppm}</li>
                <li><b>Исход %</b>: {TIP.outcome}</li>
                <li><b>Разница %</b>: {TIP.diff}</li>
                <li><b>Точный %</b>: {TIP.exact}</li>
                <li><b>Форма</b>: {TIP.form}</li>
                <li><b>Архетип</b>: {TIP.archetype}</li>
              </ul>
              <div style={{ marginTop: 10, opacity: 0.8 }}>
                Обновление происходит автоматически после нажатия <b>«Счёт»</b> в админке (мы пересчитываем
                points_ledger и затем analytics_* таблицы).
              </div>
            </div>
          </details>
        </div>

        <div className="analyticsControls">
          <Link href={q({ mode: "compact" })} className={`appNavLink ${mode === "compact" ? "navActive" : ""}`}>
            Коротко
          </Link>
          <Link href={q({ mode: "details" })} className={`appNavLink ${mode === "details" ? "navActive" : ""}`}>
            Подробнее
          </Link>

          <Link href={q({ sort: "ppm" })} className="appNavLink" title={TIP.ppm}>Сорт: Очки/матч</Link>
          <Link href={q({ sort: "form" })} className="appNavLink" title={TIP.form}>Форма</Link>
          <Link href={q({ sort: "points" })} className="appNavLink" title={TIP.points}>Очки</Link>
          <Link href={q({ sort: "matches" })} className="appNavLink" title={TIP.matches}>Матчи</Link>
          <Link href={q({ sort: "outcome" })} className="appNavLink" title={TIP.outcome}>Исход%</Link>
          <Link href={q({ sort: "diff" })} className="appNavLink" title={TIP.diff}>Разн.%</Link>
          <Link href={q({ sort: "exact" })} className="appNavLink" title={TIP.exact}>Точный%</Link>
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

        <div className="card analyticsSummaryCard">
          <div className="analyticsSummaryInner" title={TIP.top}>
            <div className="analyticsSummaryLabel">TOP-порог</div>
            <div className="analyticsSummaryValue">
              {MIN_TOP_MATCHES} <span className="analyticsSummaryMuted">матча</span>
            </div>
          </div>
        </div>
      </div>

      {/* TOP */}
      <div style={{ marginTop: 14 }}>
        <div className="analyticsSectionTitle">TOP по этапу</div>

        <div className="analyticsTopGrid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" as any }}>
          {topPPM ? (
            <TopMiniCard
              title="🏆 Очки/матч"
              href={`/analytics/${topPPM.uid}`}
              name={topPPM.name}
              value={n2(topPPM.ppm)}
              meta={`Матчей: ${topPPM.matches}`}
              tip={TIP.ppm}
            />
          ) : null}

          {topForm ? (
            <TopMiniCard
              title="📈 Форма"
              href={`/analytics/${topForm.uid}`}
              name={topForm.name}
              value={fmtMomentum(topForm.momentum, topForm.matches)}
              meta={`Матчей: ${topForm.matches}`}
              tip={TIP.form}
            />
          ) : null}

          {topPoints ? (
            <TopMiniCard
              title="💰 Очки"
              href={`/analytics/${topPoints.uid}`}
              name={topPoints.name}
              value={n2(topPoints.pointsSum)}
              meta={`Матчей: ${topPoints.matches}`}
              tip={TIP.points}
            />
          ) : null}
        </div>

        <div className="analyticsTopGrid" style={{ marginTop: 10, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" as any }}>
          {topOutcome ? (
            <TopMiniCard
              title="🎯 Исход %"
              href={`/analytics/${topOutcome.uid}`}
              name={topOutcome.name}
              value={pct01(topOutcome.outcomeRate)}
              meta={`Матчей: ${topOutcome.matches}`}
              tip={TIP.outcome}
            />
          ) : null}

          {topDiff ? (
            <TopMiniCard
              title="📐 Разница %"
              href={`/analytics/${topDiff.uid}`}
              name={topDiff.name}
              value={pct01(topDiff.diffRate)}
              meta={`Матчей: ${topDiff.matches}`}
              tip={TIP.diff}
            />
          ) : null}

          {topExact ? (
            <TopMiniCard
              title="🏹 Точный %"
              href={`/analytics/${topExact.uid}`}
              name={topExact.name}
              value={pct01(topExact.exactRate)}
              meta={`Матчей: ${topExact.matches}`}
              tip={TIP.exact}
            />
          ) : null}
        </div>

        <div className="analyticsHint" title={TIP.top}>
          TOP считается только для участников, у кого учтено <b>{MIN_TOP_MATCHES}+</b> матча.
        </div>
      </div>

      {/* table */}
      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table className="table" style={{ minWidth: 1040 }}>
          <thead>
            <tr>
              <th className="thLeft">Участник</th>

              <th className="thCenter" style={{ width: 90 }}>
                <ThHelp label="Матчи" tip={TIP.matches} />
              </th>

              <th className="thCenter" style={{ width: 110 }}>
                <ThHelp label="Очки" tip={TIP.points} />
              </th>

              <th className="thCenter" style={{ width: 120 }}>
                <ThHelp label="Очки/матч" tip={TIP.ppm} />
              </th>

              <th className="thCenter" style={{ width: 110 }}>
                <ThHelp label="Исход" tip={TIP.outcome} />
              </th>

              <th className="thCenter" style={{ width: 110 }}>
                <ThHelp label="Разница" tip={TIP.diff} />
              </th>

              <th className="thCenter" style={{ width: 110 }}>
                <ThHelp label="Точный" tip={TIP.exact} />
              </th>

              <th className="thCenter" style={{ width: 220 }}>
                <ThHelp label="Архетип" tip={TIP.archetype} />
              </th>

              {mode === "details" ? (
                <th className="thCenter" style={{ width: 170 }}>
                  <ThHelp label="Форма" tip={TIP.spark} />
                </th>
              ) : null}
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
                    {mode === "details" ? <div style={{ marginTop: 6, opacity: 0.78 }}>{c.summary_ru}</div> : null}
                  </td>

                  <td className="tdCenter">
                    <span className="badge isNeutral" title={TIP.matches}>
                      {c.matches}
                    </span>
                  </td>

                  <td className="tdCenter" title={TIP.points}>
                    <b>{n2(c.pointsSum)}</b>
                  </td>

                  <td className="tdCenter" title={TIP.ppm}>
                    <b>{n2(c.ppm)}</b>
                  </td>

                  <td className="tdCenter" title={TIP.outcome}>
                    <b>{pct01(c.outcomeRate)}</b>
                  </td>

                  <td className="tdCenter" title={TIP.diff}>
                    <b>{pct01(c.diffRate)}</b>
                  </td>

                  <td className="tdCenter" title={TIP.exact}>
                    <b>{pct01(c.exactRate)}</b>
                  </td>

                  <td className="tdCenter">
                    <span className={badgeClassByKey(c.archetype_key)} title={c.summary_ru}>
                      <span aria-hidden="true">{icon}</span> {c.title_ru}
                      {c.state === "preliminary" ? <span style={{ opacity: 0.7, marginLeft: 6 }}>· предвар.</span> : null}
                      {c.state === "final" ? <span style={{ opacity: 0.7, marginLeft: 6 }}>· финал</span> : null}
                    </span>
                  </td>

                  {mode === "details" ? (
                    <td className="tdCenter" title={TIP.spark}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <Sparkline values={c.series} />
                        <span className="badge isNeutral" title={TIP.form}>
                          {fmtMomentum(c.momentum, c.matches)}
                        </span>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mode === "compact" ? (
        <div className="analyticsHintSmall">
          Детали (описание архетипа, спарклайн формы, число “форма”) — включи режим <b>Подробнее</b>.
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <Link href="/dashboard" className="navLink">
          ← Назад
        </Link>
      </div>
    </div>
  );
}