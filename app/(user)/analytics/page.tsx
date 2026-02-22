import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type StageRow = { id: number; name: string };

type LoginAccountRow = {
  user_id: string;
  login: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type AggRow = {
  stage_id: number;
  user_id: string;
  matches_count: number;

  exact_count: number;

  pred_home_count: number;
  pred_draw_count: number;
  pred_away_count: number;

  pred_total_sum: number;
  pred_absdiff_sum: number;
  pred_bigdiff_count: number;

  outcome_hit_count?: number;
  diff_hit_count?: number;
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
  momentum_series: any; // jsonb
  avg_last_n: number;
  avg_all: number;
  n: number;
  k: number;
  updated_at: string;
};

type SearchParams = {
  sort?: string;
  view?: string; // quality|style
  mode?: string; // compact|details
};

type Props = {
  searchParams?: Promise<SearchParams>;
};

const MIN_TOP_MATCHES = 3;

const SORT_OPTIONS_QUALITY: Array<{ value: string; label: string }> = [
  { value: "matches", label: "Матчей учтено" },
  { value: "exact", label: "Точные счета %" },
  { value: "outcome", label: "Исход %" },
  { value: "diff", label: "Разница %" },
  { value: "name", label: "Имя" },
];

const SORT_OPTIONS_STYLE: Array<{ value: string; label: string }> = [
  { value: "matches", label: "Матчей учтено" },
  { value: "risk", label: "Риск (разница)" },
  { value: "draw", label: "Ничьи %" },
  { value: "total", label: "Средний тотал" },
  { value: "name", label: "Имя" },
];

function safeDiv(a: number, b: number): number {
  if (!b) return 0;
  return a / b;
}

function pct01(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function n2(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

function stageStateLabel(state: ArchRow["state"]) {
  if (state === "forming") return "Формируется";
  if (state === "preliminary") return "Предварительно";
  return "";
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
    case "home":
      return "🏠";
    case "away":
      return "✈️";
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
    case "home":
    case "away":
      return "badge isNeutral";
    case "forming":
      return "badge isNeutral";
    default:
      return "badge isNeutral";
  }
}

function Sparkline(props: { values: number[] }) {
  const W = 140;
  const H = 34;
  const pad = 2;

  const vals = (props.values ?? []).slice(-10);
  if (vals.length < 2) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path
          d={`M${pad} ${H - pad} L${W - pad} ${H - pad}`}
          stroke="rgba(17,24,39,.16)"
          fill="none"
        />
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

  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(" ");

  const hasZero = min < 0 && max > 0;
  const y0 = hasZero ? pad + (1 - (0 - min) / (max - min)) * (H - pad * 2) : null;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График формы">
      {y0 != null ? (
        <line x1={pad} y1={y0} x2={W - pad} y2={y0} stroke="rgba(17,24,39,.12)" />
      ) : null}
      <path
        d={d}
        stroke="rgba(37,99,235,.85)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OutcomeBar(props: { home: number; draw: number; away: number }) {
  const W = 220;
  const H = 10;
  const total = props.home + props.draw + props.away;
  const h = total ? (props.home / total) * W : 0;
  const d = total ? (props.draw / total) * W : 0;
  const a = total ? (props.away / total) * W : 0;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Распределение исходов"
    >
      <rect x="0" y="0" width={W} height={H} rx="5" fill="rgba(17,24,39,.08)" />
      <rect x="0" y="0" width={h} height={H} rx="5" fill="rgba(37,99,235,.60)" />
      <rect x={h} y="0" width={d} height={H} fill="rgba(16,185,129,.55)" />
      <rect x={h + d} y="0" width={a} height={H} rx="5" fill="rgba(245,158,11,.60)" />
    </svg>
  );
}

function TabLink(props: { href: string; active: boolean; label: string; icon: string }) {
  return (
    <Link href={props.href} className={`appNavLink ${props.active ? "navActive" : ""}`}>
      <span aria-hidden="true" className="appNavIcon">{props.icon}</span>
      <span>{props.label}</span>
    </Link>
  );
}

function ModePill(props: { href: string; active: boolean; label: string }) {
  return (
    <Link href={props.href} className={`appNavLink ${props.active ? "navActive" : ""}`}>
      <span>{props.label}</span>
    </Link>
  );
}

function TopMiniCard(props: {
  title: string;
  name: string;
  value: string;
  meta: string;
  href?: string;
}) {
  const body = (
    <div className="card analyticsTopCard">
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

export default async function AnalyticsPage({ searchParams }: Props) {
  const sb = service();

  const sp = (searchParams ? await searchParams : {}) as SearchParams;

  const viewRaw = (sp.view ?? "quality").toLowerCase();
  const view: "quality" | "style" = viewRaw === "style" ? "style" : "quality";

  const modeRaw = (sp.mode ?? "compact").toLowerCase();
  const mode: "compact" | "details" = modeRaw === "details" ? "details" : "compact";

  const sort = (sp.sort ?? "matches").toLowerCase();
  const sortOptions = view === "style" ? SORT_OPTIONS_STYLE : SORT_OPTIONS_QUALITY;

  // Текущий этап
  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("id,name")
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

  const { data: base } = await sb
    .from("analytics_stage_baseline")
    .select("updated_at,users_count")
    .eq("stage_id", stageId)
    .maybeSingle();

  const { count: finishedCnt } = await sb
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", stageId)
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  // Пользователи (без ADMIN)
  const { data: accounts, error: accErr } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .not("user_id", "is", null);

  if (accErr) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Ошибка загрузки пользователей: {accErr.message}</p>
      </div>
    );
  }

  const realAccounts = (accounts ?? []).filter(
    (a: LoginAccountRow) => String(a.login ?? "").trim().toUpperCase() !== "ADMIN"
  );

  const realUserIds = Array.from(new Set(realAccounts.map((a: LoginAccountRow) => a.user_id)));

  if (realUserIds.length === 0) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Нет участников для отображения.</p>
      </div>
    );
  }

  const { data: archRows } = await sb
    .from("analytics_stage_user_archetype")
    .select("stage_id,user_id,archetype_key,title_ru,summary_ru,state,updated_at")
    .eq("stage_id", stageId)
    .in("user_id", realUserIds);

  const { data: aggRows } = await sb
    .from("analytics_stage_user")
    .select(
      "stage_id,user_id,matches_count,exact_count,pred_home_count,pred_draw_count,pred_away_count,pred_total_sum,pred_absdiff_sum,pred_bigdiff_count,outcome_hit_count,diff_hit_count"
    )
    .eq("stage_id", stageId)
    .in("user_id", realUserIds);

  const { data: momRows } = await sb
    .from("analytics_stage_user_momentum")
    .select("stage_id,user_id,matches_count,momentum_current,momentum_series,avg_last_n,avg_all,n,k,updated_at")
    .eq("stage_id", stageId)
    .in("user_id", realUserIds);

  const { data: profiles } = await sb
    .from("profiles")
    .select("id,display_name")
    .in("id", realUserIds);

  const profMap = new Map<string, ProfileRow>();
  for (const p of profiles ?? []) profMap.set(p.id, p);

  const aggMap = new Map<string, AggRow>();
  for (const a of aggRows ?? []) aggMap.set(a.user_id, a);

  const archMap = new Map<string, ArchRow>();
  for (const a of archRows ?? []) archMap.set(a.user_id, a);

  const momMap = new Map<string, MomRow>();
  for (const m of momRows ?? []) momMap.set(m.user_id, m);

  const cards = realUserIds.map((uid) => {
    const acc = realAccounts.find((a) => a.user_id === uid);
    const prof = profMap.get(uid);
    const agg = aggMap.get(uid);
    const mom = momMap.get(uid);

    const arch =
      archMap.get(uid) ??
      ({
        stage_id: stageId,
        user_id: uid,
        archetype_key: "forming",
        title_ru: "Формируется",
        summary_ru: "Пока мало данных для стиля. Нужны завершённые матчи и заполненные прогнозы.",
        state: "forming",
        updated_at: base?.updated_at ?? new Date().toISOString(),
      } as ArchRow);

    const matches = agg?.matches_count ?? 0;

    const exactRate = safeDiv(agg?.exact_count ?? 0, matches);
    const outcomeRate = safeDiv(agg?.outcome_hit_count ?? 0, matches);
    const diffRate = safeDiv(agg?.diff_hit_count ?? 0, matches);

    const drawRate = safeDiv(agg?.pred_draw_count ?? 0, matches);
    const avgTotal = matches ? Number(agg?.pred_total_sum ?? 0) / matches : 0;
    const avgAbsDiff = matches ? Number(agg?.pred_absdiff_sum ?? 0) / matches : 0;

    const predHome = agg?.pred_home_count ?? 0;
    const predDraw = agg?.pred_draw_count ?? 0;
    const predAway = agg?.pred_away_count ?? 0;

    const name =
      (prof?.display_name ?? "").trim() ||
      (acc?.login ?? "").trim() ||
      uid.slice(0, 8);

    const momentumCurrent = Number(mom?.momentum_current ?? 0);
    const momentumSeriesRaw = mom?.momentum_series ?? [];
    const momentumSeries = Array.isArray(momentumSeriesRaw)
      ? momentumSeriesRaw.map((x: any) => Number(x ?? 0))
      : [];

    return {
      uid,
      name,
      matches,

      exactRate,
      outcomeRate,
      diffRate,

      drawRate,
      avgTotal,
      avgAbsDiff,

      predHome,
      predDraw,
      predAway,

      archetype_key: arch.archetype_key,
      title_ru: arch.title_ru,
      summary_ru: arch.summary_ru,
      state: arch.state,

      momentumCurrent,
      momentumSeries,
    };
  });

  // TOP — только если матчей достаточно
  const withEnough = cards.filter((c) => c.matches >= MIN_TOP_MATCHES);

  const pickTop = <T,>(arr: T[], score: (x: any) => number) =>
    [...arr].sort(
      (a: any, b: any) =>
        score(b) - score(a) || (b.matches ?? 0) - (a.matches ?? 0)
    )[0] ?? null;

  const bestExact = withEnough.length ? pickTop(withEnough, (c) => c.exactRate) : null;
  const bestOutcome = withEnough.length ? pickTop(withEnough, (c) => c.outcomeRate) : null;
  const bestDiff = withEnough.length ? pickTop(withEnough, (c) => c.diffRate) : null;

  const mostRisky = withEnough.length ? pickTop(withEnough, (c) => c.avgAbsDiff) : null;
  const mostPeace = withEnough.length ? pickTop(withEnough, (c) => c.drawRate) : null;
  const mostHighTotal = withEnough.length ? pickTop(withEnough, (c) => c.avgTotal) : null;

  // сортировка списка
  const sorted = [...cards].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "exact") return b.exactRate - a.exactRate;
    if (sort === "outcome") return b.outcomeRate - a.outcomeRate;
    if (sort === "diff") return b.diffRate - a.diffRate;
    if (sort === "risk") return b.avgAbsDiff - a.avgAbsDiff;
    if (sort === "draw") return b.drawRate - a.drawRate;
    if (sort === "total") return b.avgTotal - a.avgTotal;
    return (b.matches ?? 0) - (a.matches ?? 0);
  });

  const updated = base?.updated_at ? new Date(base.updated_at).toLocaleString("ru-RU") : "—";
  const usersCount = base?.users_count ?? realUserIds.length;

  const finished = finishedCnt ?? 0;
  const totalMatches = 56;

  // простая “форма” для компактного отображения
  function fmtMomentum(m: number, matches: number) {
    if (matches < 3) return "н/д";
    const arrow = m > 0.02 ? "↗" : m < -0.02 ? "↘" : "→";
    const sign = m >= 0 ? "+" : "";
    return `${sign}${n2(m)} ${arrow}`;
  }

  const baseHref = "/analytics";
  const q = (next: Partial<SearchParams>) => {
    const p = new URLSearchParams();
    p.set("view", next.view ?? view);
    p.set("sort", next.sort ?? sort);
    p.set("mode", next.mode ?? mode);
    return `${baseHref}?${p.toString()}`;
  };

  return (
    <div className="page">
      <div className="analyticsHead">
        <div>
          <h1>Аналитика</h1>
          <div className="pageMeta">
            Этап: <b>{stage.name}</b> · обновлено: <b>{updated}</b>
          </div>

          <div className="analyticsHintSmall" style={{ marginTop: 10 }}>
            По умолчанию показано <b>коротко</b>. Для деталей включи режим <b>Подробнее</b>.
          </div>
        </div>

        <div className="analyticsControls">
          <TabLink href={q({ view: "quality", sort: "matches" })} active={view === "quality"} label="Качество" icon="🎯" />
          <TabLink href={q({ view: "style", sort: "matches" })} active={view === "style"} label="Стиль" icon="🎛️" />

          <ModePill href={q({ mode: "compact" })} active={mode === "compact"} label="Коротко" />
          <ModePill href={q({ mode: "details" })} active={mode === "details"} label="Подробнее" />

          <form action="/analytics" method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="mode" value={mode} />
            <select className="select" name="sort" defaultValue={sort}>
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  Сортировка: {o.label}
                </option>
              ))}
            </select>
            <button className="appNavLink" type="submit">
              Применить
            </button>
          </form>
        </div>
      </div>

      {/* Сводка (максимум 4 числа) */}
      <div className="analyticsSummary" style={{ marginTop: 14 }}>
        <div className="card analyticsSummaryCard">
          <div className="analyticsSummaryInner" title="Сколько матчей завершено (и попало в расчёт аналитики)">
            <div className="analyticsSummaryLabel">Завершено</div>
            <div className="analyticsSummaryValue">
              {finished} <span className="analyticsSummaryMuted">/ {totalMatches}</span>
            </div>
          </div>
        </div>

        <div className="card analyticsSummaryCard">
          <div className="analyticsSummaryInner" title="Сколько участников (без ADMIN)">
            <div className="analyticsSummaryLabel">Участников</div>
            <div className="analyticsSummaryValue">{usersCount}</div>
          </div>
        </div>

        <div className="card analyticsSummaryCard">
          <div
            className="analyticsSummaryInner"
            title={`TOP считается только для участников, у кого учтено минимум ${MIN_TOP_MATCHES} матч(а/ей)`}
          >
            <div className="analyticsSummaryLabel">TOP-порог</div>
            <div className="analyticsSummaryValue">
              {MIN_TOP_MATCHES} <span className="analyticsSummaryMuted">матча</span>
            </div>
          </div>
        </div>

        <div className="card analyticsSummaryCard">
          <div className="analyticsSummaryInner" title="Режим отображения страницы">
            <div className="analyticsSummaryLabel">Режим</div>
            <div className="analyticsSummaryValue">{mode === "compact" ? "Коротко" : "Подробнее"}</div>
          </div>
        </div>
      </div>

      {/* TOP (сократил до 3 карточек) */}
      <div style={{ marginTop: 14 }}>
        <div className="analyticsSectionTitle">TOP по этапу</div>

        <div className="analyticsTopGrid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" as any }}>
          {view === "quality" ? (
            <>
              {bestExact ? (
                <TopMiniCard
                  title="🏹 Точный счёт"
                  href={`/analytics/${bestExact.uid}`}
                  name={bestExact.name}
                  value={pct01(bestExact.exactRate)}
                  meta={`Матчей: ${bestExact.matches}`}
                />
              ) : null}

              {bestOutcome ? (
                <TopMiniCard
                  title="🎯 Исход"
                  href={`/analytics/${bestOutcome.uid}`}
                  name={bestOutcome.name}
                  value={pct01(bestOutcome.outcomeRate)}
                  meta={`Матчей: ${bestOutcome.matches}`}
                />
              ) : null}

              {bestDiff ? (
                <TopMiniCard
                  title="📐 Разница"
                  href={`/analytics/${bestDiff.uid}`}
                  name={bestDiff.name}
                  value={pct01(bestDiff.diffRate)}
                  meta={`Матчей: ${bestDiff.matches}`}
                />
              ) : null}
            </>
          ) : (
            <>
              {mostRisky ? (
                <TopMiniCard
                  title="🔥 Риск"
                  href={`/analytics/${mostRisky.uid}`}
                  name={mostRisky.name}
                  value={n2(mostRisky.avgAbsDiff)}
                  meta={`Матчей: ${mostRisky.matches}`}
                />
              ) : null}

              {mostHighTotal ? (
                <TopMiniCard
                  title="⚽ Тотал"
                  href={`/analytics/${mostHighTotal.uid}`}
                  name={mostHighTotal.name}
                  value={n2(mostHighTotal.avgTotal)}
                  meta={`Матчей: ${mostHighTotal.matches}`}
                />
              ) : null}

              {mostPeace ? (
                <TopMiniCard
                  title="🤝 Ничьи"
                  href={`/analytics/${mostPeace.uid}`}
                  name={mostPeace.name}
                  value={pct01(mostPeace.drawRate)}
                  meta={`Матчей: ${mostPeace.matches}`}
                />
              ) : null}
            </>
          )}
        </div>

        <div className="analyticsHint">
          TOP считается только для участников, у кого учтено <b>{MIN_TOP_MATCHES}+</b> матча.
        </div>
      </div>

      {/* Участники (компактная таблица) */}
      <div style={{ marginTop: 16 }}>
        <div className="analyticsSectionTitle">Участники</div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th className="thLeft">Участник</th>
                <th className="thCenter" style={{ width: 110 }}>Матчи</th>

                {view === "quality" ? (
                  <>
                    <th className="thCenter" style={{ width: 140 }}>Точный</th>
                    <th className="thCenter" style={{ width: 120 }}>Исход</th>
                    <th className="thCenter" style={{ width: 120 }}>Разница</th>
                  </>
                ) : (
                  <>
                    <th className="thCenter" style={{ width: 120 }}>Риск</th>
                    <th className="thCenter" style={{ width: 120 }}>Тотал</th>
                    <th className="thCenter" style={{ width: 120 }}>Ничьи</th>
                  </>
                )}

                <th className="thCenter" style={{ width: 140 }}>Форма</th>
                <th className="thCenter" style={{ width: 220 }}>Архетип</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((c) => {
                const icon = archetypeIcon(c.archetype_key);
                const stateLabel = stageStateLabel(c.state);

                return (
                  <tr key={c.uid}>
                    <td className="tdLeft">
                      <div style={{ fontWeight: 950 }}>
                        <Link href={`/analytics/${c.uid}`}>{c.name}</Link>
                      </div>

                      {mode === "details" ? (
                        <div style={{ marginTop: 6, opacity: 0.75, fontWeight: 800 }}>
                          1/X/2: {pct01(safeDiv(c.predHome, c.matches))} / {pct01(safeDiv(c.predDraw, c.matches))} /{" "}
                          {pct01(safeDiv(c.predAway, c.matches))}
                        </div>
                      ) : null}
                    </td>

                    <td className="tdCenter">
                      <span className="badge isNeutral" title="Сколько завершённых матчей вошло в расчёт">
                        {c.matches}
                      </span>
                    </td>

                    {view === "quality" ? (
                      <>
                        <td className="tdCenter"><b>{pct01(c.exactRate)}</b></td>
                        <td className="tdCenter"><b>{pct01(c.outcomeRate)}</b></td>
                        <td className="tdCenter"><b>{pct01(c.diffRate)}</b></td>
                      </>
                    ) : (
                      <>
                        <td className="tdCenter"><b>{n2(c.avgAbsDiff)}</b></td>
                        <td className="tdCenter"><b>{n2(c.avgTotal)}</b></td>
                        <td className="tdCenter"><b>{pct01(c.drawRate)}</b></td>
                      </>
                    )}

                    <td className="tdCenter" title="Форма = (средние очки за последние 5 матчей) − (средние очки за весь этап)">
                      <span className="badge isNeutral">{fmtMomentum(c.momentumCurrent, c.matches)}</span>
                    </td>

                    <td className="tdCenter">
                      <span
                        className={badgeClassByKey(c.archetype_key)}
                        title={mode === "details" ? c.summary_ru : "Включи режим «Подробнее», чтобы читать описание"}
                      >
                        <span aria-hidden="true">{icon}</span> {c.title_ru}
                        {stateLabel ? <span style={{ opacity: 0.7, marginLeft: 6 }}>· {stateLabel}</span> : null}
                      </span>

                      {mode === "details" ? (
                        <details className="helpBox" style={{ marginTop: 10, textAlign: "left" }}>
                          <summary className="helpSummary">Детали</summary>
                          <div className="helpBody">
                            <div style={{ fontWeight: 900, marginBottom: 8 }}>Архетип</div>
                            <div style={{ opacity: 0.85 }}>{c.summary_ru}</div>

                            <div style={{ marginTop: 12, fontWeight: 900, marginBottom: 8 }}>Форма (последние значения)</div>
                            <Sparkline values={c.momentumSeries ?? []} />

                            <div style={{ marginTop: 12, fontWeight: 900, marginBottom: 8 }}>Распределение 1/X/2</div>
                            <OutcomeBar home={c.predHome} draw={c.predDraw} away={c.predAway} />
                          </div>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {mode === "compact" ? (
          <div className="analyticsHintSmall">
            Подробности (описание архетипа, график формы, распределение 1/X/2) — включи режим <b>Подробнее</b>.
          </div>
        ) : null}
      </div>
    </div>
  );
}