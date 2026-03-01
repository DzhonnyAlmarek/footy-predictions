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
  exact_count: number;
  outcome_hit_count: number;
  diff_hit_count: number;
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

type LedgerRow = {
  user_id: string;
  match_id: number;
  points: string | number;
  matches: {
    kickoff_at: string | null;
    stage_id: number;
    status: string | null;
    home_score: number | null;
    away_score: number | null;
    stage_match_no: number | null;
  } | null;
};

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
function sumNums(arr: number[]) {
  return (arr ?? []).reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
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

/* ---------- user-level tips ---------- */

const TIP = {
  matches:
    "Сколько сыгранных матчей уже учтено для вас. Обычно это матчи, по которым начислены очки.",
  points: "Сумма очков за сыгранные матчи текущего этапа.",
  avgPoints:
    "Среднее число очков за матч. Удобно сравнивать участников, если у кого-то учтено больше матчей.",
  outcome:
    "Как часто вы угадываете победу/ничью/поражение (1/X/2), даже если точный счёт не совпал.",
  diff:
    "Как часто вы угадываете разницу мячей (например 2:1 и 3:2 — обе разница +1).",
  exact: "Как часто вы угадываете точный счёт.",
  form:
    "Показывает, стали ли последние матчи лучше вашего среднего уровня. Плюс — вы набираете больше обычного, минус — меньше.",
  spark:
    "Очки по матчам подряд (слева старее → справа новее). Видно серии и провалы.",
  stageChart:
    "Каждая линия — накопленные очки участника. Шаг по оси X — матч. Видно, кто ускоряется, а кто буксует.",
  archetype:
    "Ваш стиль прогнозов (осторожный/смелый/точный и т.д.). Это про манеру, а не про “сильнее/слабее”.",
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
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Очки по матчам">
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

/* ---------- stage-wide chart ---------- */

function StageLinesChart(props: {
  matchLabels: string[];
  series: Array<{ name: string; values: number[] }>; // cumulative
}) {
  const W = 980;
  const H = 260;
  const padL = 44;
  const padR = 14;
  const padT = 18;
  const padB = 32;

  const n = props.matchLabels.length;
  if (n < 2) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardBody" style={{ opacity: 0.8 }}>
          Недостаточно сыгранных матчей для графика динамики.
        </div>
      </div>
    );
  }

  const maxY =
    Math.max(
      1,
      ...props.series.flatMap((s) => s.values.map((v) => (Number.isFinite(v) ? v : 0)))
    ) || 1;

  const x = (i: number) => {
    const dx = (W - padL - padR) / (n - 1);
    return padL + i * dx;
  };

  const y = (v: number) => {
    const t = Math.max(0, Math.min(1, v / maxY));
    return padT + (1 - t) * (H - padT - padB);
  };

  const palette = [
    "rgba(37,99,235,.80)",
    "rgba(16,185,129,.75)",
    "rgba(245,158,11,.78)",
    "rgba(239,68,68,.72)",
    "rgba(168,85,247,.72)",
    "rgba(14,165,233,.75)",
    "rgba(234,179,8,.78)",
    "rgba(34,197,94,.70)",
  ];

  function pathD(vals: number[]) {
    return vals
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
      .join(" ");
  }

  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="cardBody">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div style={{ fontWeight: 950 }} title={TIP.stageChart}>
            Динамика очков по ходу этапа
          </div>
          <div style={{ opacity: 0.75, fontSize: 12 }} title={TIP.stageChart}>
            линия = накопленные очки, шаг = матч
          </div>
        </div>

        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График динамики очков">
            <rect x="0" y="0" width={W} height={H} rx="12" fill="rgba(17,24,39,.04)" />

            {grid.map((t, idx) => {
              const yy = padT + (1 - t) * (H - padT - padB);
              const v = Math.round(maxY * t);
              return (
                <g key={idx}>
                  <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(17,24,39,.10)" />
                  <text
                    x={padL - 10}
                    y={yy + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="rgba(17,24,39,.55)"
                  >
                    {v}
                  </text>
                </g>
              );
            })}

            <line
              x1={padL}
              y1={H - padB}
              x2={W - padR}
              y2={H - padB}
              stroke="rgba(17,24,39,.18)"
            />

            {props.matchLabels.map((lab, i) => {
              if (i % 2 === 1 && n > 10) return null;
              const xx = x(i);
              return (
                <text
                  key={lab + i}
                  x={xx}
                  y={H - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill="rgba(17,24,39,.55)"
                >
                  {lab}
                </text>
              );
            })}

            {props.series.map((s, idx) => {
              const color = palette[idx % palette.length];
              const d = pathD(s.values);
              return (
                <g key={s.name}>
                  <path d={d} stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round">
                    <title>
                      {s.name} — {s.values[s.values.length - 1].toFixed(2)} очков
                    </title>
                  </path>
                </g>
              );
            })}
          </svg>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {props.series.map((s, idx) => {
            const color = palette[idx % palette.length];
            return (
              <span
                key={s.name}
                className="badge isNeutral"
                style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                title="Наведи на линию на графике — увидишь подсказку"
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    background: color,
                    display: "inline-block",
                  }}
                />
                {s.name}
              </span>
            );
          })}
        </div>

        <div className="analyticsHintSmall" style={{ marginTop: 10, opacity: 0.8 }}>
          Подсказка: наведи курсор на линию — увидишь итоговые очки участника.
        </div>
      </div>
    </div>
  );
}

/* ---------------- main ---------------- */

export default async function AnalyticsPage({ searchParams }: Props) {
  const sb = service();
  const sp = (searchParams ? await searchParams : {}) as SearchParams;

  const sort = (sp.sort ?? "avg").toLowerCase(); // avg|points|matches|outcome|diff|exact|name
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

  // Пользователи (без ADMIN)
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

  // качество (проценты точный/исход/разница) — из analytics_stage_user
  const { data: aggRows } = await sb
    .from("analytics_stage_user")
    .select("stage_id,user_id,matches_count,exact_count,outcome_hit_count,diff_hit_count")
    .eq("stage_id", stageId)
    .in("user_id", userIds);

  const aggMap = new Map<string, AggRow>();
  for (const a of (aggRows ?? []) as any[]) aggMap.set(a.user_id, a as AggRow);

  // архетип
  const { data: archRows } = await sb
    .from("analytics_stage_user_archetype")
    .select("stage_id,user_id,archetype_key,title_ru,summary_ru,state,updated_at")
    .eq("stage_id", stageId)
    .in("user_id", userIds);

  const archMap = new Map<string, ArchRow>();
  for (const a of (archRows ?? []) as any[]) archMap.set(a.user_id, a as ArchRow);

  // ✅ очки/матчи/серии — из points_ledger (чтобы совпадало с текущей таблицей)
  const { data: ledgerRows, error: ledErr } = await sb
    .from("points_ledger")
    .select(
      `
      user_id,
      match_id,
      points,
      matches:matches!inner (
        stage_id,
        kickoff_at,
        status,
        home_score,
        away_score,
        stage_match_no
      )
    `
    )
    .eq("reason", "prediction")
    .in("user_id", userIds)
    .eq("matches.stage_id", stageId);

  if (ledErr) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Ошибка загрузки начислений: {ledErr.message}</p>
      </div>
    );
  }

  const perUserSum = new Map<string, number>();
  const perUserMatchSet = new Map<string, Set<number>>();
  const perUserSeries = new Map<string, Array<{ t: number; pts: number }>>();

  for (const r of (ledgerRows ?? []) as any as LedgerRow[]) {
    const m = r.matches;
    if (!m) continue;

    // считаем только завершённые матчи со счётом
    const okFinished =
      String(m.status ?? "") === "finished" &&
      m.home_score != null &&
      m.away_score != null;

    if (!okFinished) continue;

    const uid = r.user_id;
    const pts = Number(r.points ?? 0);
    const mid = Number(r.match_id);

    perUserSum.set(uid, (perUserSum.get(uid) ?? 0) + pts);

    if (!perUserMatchSet.has(uid)) perUserMatchSet.set(uid, new Set());
    perUserMatchSet.get(uid)!.add(mid);

    const t = m.kickoff_at ? new Date(m.kickoff_at).getTime() : 0;
    if (!perUserSeries.has(uid)) perUserSeries.set(uid, []);
    perUserSeries.get(uid)!.push({ t, pts });
  }

  // --- timeline for stage-wide chart (x-axis)
  const { data: stageMatches, error: mErr } = await sb
    .from("matches")
    .select("id,kickoff_at,stage_match_no,status,home_score,away_score")
    .eq("stage_id", stageId)
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("kickoff_at", { ascending: true });

  if (mErr) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Ошибка загрузки матчей: {mErr.message}</p>
      </div>
    );
  }

  const timeline = (stageMatches ?? []).map((m: any, idx: number) => ({
    id: Number(m.id),
    label: m.stage_match_no != null ? `#${m.stage_match_no}` : `#${idx + 1}`,
  }));

  // user -> match -> points (for cumulative lines)
  const ptsByUserMatch = new Map<string, Map<number, number>>();
  for (const r of (ledgerRows ?? []) as any as LedgerRow[]) {
    const m = r.matches;
    if (!m) continue;

    const okFinished =
      String(m.status ?? "") === "finished" &&
      m.home_score != null &&
      m.away_score != null;

    if (!okFinished) continue;

    const uid = r.user_id;
    const mid = Number(r.match_id);
    const pts = Number(r.points ?? 0);

    if (!ptsByUserMatch.has(uid)) ptsByUserMatch.set(uid, new Map());
    ptsByUserMatch.get(uid)!.set(mid, pts);
  }

  const chartSeries = userIds
    .map((uid) => {
      const name =
        (profMap.get(uid)?.display_name ?? "").trim() ||
        (realAccounts.find((a) => a.user_id === uid)?.login ?? "").trim() ||
        uid.slice(0, 8);

      let acc = 0;
      const values = timeline.map((t) => {
        acc += ptsByUserMatch.get(uid)?.get(t.id) ?? 0;
        return Math.round(acc * 100) / 100;
      });

      return { name, values };
    })
    .sort((a, b) => (b.values[b.values.length - 1] ?? 0) - (a.values[a.values.length - 1] ?? 0));

  // cards list
  const cards = userIds.map((uid) => {
    const acc = realAccounts.find((a) => a.user_id === uid);
    const prof = profMap.get(uid);
    const agg = aggMap.get(uid);

    const name = (prof?.display_name ?? "").trim() || (acc?.login ?? "").trim() || uid.slice(0, 8);

    const pointsSum = perUserSum.get(uid) ?? 0;
    const matches = perUserMatchSet.get(uid)?.size ?? 0;
    const avgPoints = matches ? pointsSum / matches : 0;

    const seriesPairs = (perUserSeries.get(uid) ?? []).sort((a, b) => a.t - b.t);
    const series = seriesPairs.map((x) => x.pts);

    const allAvg = matches ? pointsSum / matches : 0;
    const tail = series.slice(-5);
    const lastAvg = tail.length ? sumNums(tail) / tail.length : 0;
    const momentum = tail.length >= 2 ? lastAvg - allAvg : 0;

    // проценты качества — берём из analytics_stage_user (если там матчей меньше/больше — это отдельная история)
    const qMatches = Number(agg?.matches_count ?? 0) || 0;
    const exactRate = safeDiv(Number(agg?.exact_count ?? 0), qMatches);
    const outcomeRate = safeDiv(Number(agg?.outcome_hit_count ?? 0), qMatches);
    const diffRate = safeDiv(Number(agg?.diff_hit_count ?? 0), qMatches);

    const arch =
      archMap.get(uid) ??
      ({
        stage_id: stageId,
        user_id: uid,
        archetype_key: "forming",
        title_ru: "Формируется",
        summary_ru: "Пока мало данных для стиля.",
        state: "forming",
        updated_at: new Date().toISOString(),
      } as ArchRow);

    return {
      uid,
      name,

      matches,
      pointsSum,
      avgPoints,

      exactRate,
      outcomeRate,
      diffRate,

      series,
      momentum,

      archetype_key: arch.archetype_key,
      title_ru: arch.title_ru,
      summary_ru: arch.summary_ru,
      state: arch.state,
    };
  });

  // TOP (6 плиток)
  const pickTop = <T,>(arr: T[], score: (x: any) => number) =>
    [...arr].sort((a: any, b: any) => score(b) - score(a) || (b.matches ?? 0) - (a.matches ?? 0))[0] ?? null;

  const topAvg = pickTop(cards, (c) => c.avgPoints);
  const topPoints = pickTop(cards, (c) => c.pointsSum);
  const topOutcome = pickTop(cards, (c) => c.outcomeRate);
  const topDiff = pickTop(cards, (c) => c.diffRate);
  const topExact = pickTop(cards, (c) => c.exactRate);

  const sorted = [...cards].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "matches") return b.matches - a.matches;
    if (sort === "points") return b.pointsSum - a.pointsSum;
    if (sort === "exact") return b.exactRate - a.exactRate;
    if (sort === "outcome") return b.outcomeRate - a.outcomeRate;
    if (sort === "diff") return b.diffRate - a.diffRate;
    return b.avgPoints - a.avgPoints; // avg default
  });

  const q = (p: Partial<SearchParams>) => {
    const s = new URLSearchParams();
    s.set("sort", p.sort ?? sort);
    s.set("mode", p.mode ?? mode);
    return `/analytics?${s.toString()}`;
  };

  function fmtMomentum(m: number) {
    const arrow = m > 0.02 ? "↗" : m < -0.02 ? "↘" : "→";
    const sign = m >= 0 ? "+" : "";
    return `${sign}${n2(m)} ${arrow}`;
  }

  return (
    <div className="page">
      <div className="analyticsHead">
        <div>
          <h1>Аналитика</h1>
          <div className="pageMeta">
            Этап: <b>{stage.name}</b>
            {stage.status ? <span> · {stage.status}</span> : null}
          </div>

          <details className="helpBox" style={{ marginTop: 10 }}>
            <summary className="helpSummary">Пояснения (что означает и как читать)</summary>
            <div className="helpBody">
              <ul className="helpList">
                <li><b>Матчи</b> — {TIP.matches}</li>
                <li><b>Очки</b> — {TIP.points}</li>
                <li><b>Средние очки</b> — {TIP.avgPoints}</li>
                <li><b>Исход %</b> — {TIP.outcome}</li>
                <li><b>Разница %</b> — {TIP.diff}</li>
                <li><b>Точный %</b> — {TIP.exact}</li>
                <li><b>Форма</b> — {TIP.form}</li>
                <li><b>График</b> — {TIP.stageChart}</li>
                <li><b>Архетип</b> — {TIP.archetype}</li>
              </ul>
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

          <Link href={q({ sort: "avg" })} className="appNavLink" title={TIP.avgPoints}>
            Сорт: Средние очки
          </Link>
          <Link href={q({ sort: "points" })} className="appNavLink" title={TIP.points}>
            Очки
          </Link>
          <Link href={q({ sort: "matches" })} className="appNavLink" title={TIP.matches}>
            Матчи
          </Link>
          <Link href={q({ sort: "outcome" })} className="appNavLink" title={TIP.outcome}>
            Исход%
          </Link>
          <Link href={q({ sort: "diff" })} className="appNavLink" title={TIP.diff}>
            Разн.%
          </Link>
          <Link href={q({ sort: "exact" })} className="appNavLink" title={TIP.exact}>
            Точный%
          </Link>
          <Link href={q({ sort: "name" })} className="appNavLink">
            Имя
          </Link>
        </div>
      </div>

      {/* TOP: 2 колонки */}
      <div style={{ marginTop: 14 }}>
        <div className="analyticsSectionTitle">TOP по этапу</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {topAvg ? (
            <TopMiniCard
              title="🏆 Средние очки"
              href={`/analytics/${topAvg.uid}`}
              name={topAvg.name}
              value={n2(topAvg.avgPoints)}
              meta={`Матчей: ${topAvg.matches}`}
              tip={TIP.avgPoints}
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
      </div>

      {/* Общий график динамики */}
      <StageLinesChart matchLabels={timeline.map((t) => t.label)} series={chartSeries} />

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

              <th className="thCenter" style={{ width: 140 }}>
                <ThHelp label="Средние очки" tip={TIP.avgPoints} />
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
                <th className="thCenter" style={{ width: 220 }}>
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

                  <td className="tdCenter" title={TIP.avgPoints}>
                    <b>{n2(c.avgPoints)}</b>
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
                    <td className="tdCenter">
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div title={TIP.spark}>
                          <Sparkline values={c.series} />
                        </div>
                        <span className="badge isNeutral" title={TIP.form}>
                          {fmtMomentum(c.momentum)}
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

      <div style={{ marginTop: 14 }}>
        <Link href="/dashboard" className="navLink">
          ← Назад
        </Link>
      </div>
    </div>
  );
}