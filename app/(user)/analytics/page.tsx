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
  points:
    "Сумма очков за сыгранные матчи текущего этапа.",
  avgPoints:
    "Среднее число очков за матч. Удобно сравнивать участников, если у кого-то учтено больше матчей.",
  outcome:
    "Как часто вы угадываете победу/ничью/поражение (1/X/2), даже если точный счёт не совпал.",
  diff:
    "Как часто вы угадываете разницу мячей (например 2:1 и 3:2 — обе разница +1).",
  exact:
    "Как часто вы угадываете точный счёт.",
  form:
    "Показывает, стали ли последние матчи лучше вашего среднего уровня. Плюс — вы набираете больше обычного, минус — меньше.",
  spark:
    "Очки по матчам подряд (слева старее → справа новее). Видно серии и провалы.",
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

/* ---------------- main ---------------- */

export default async function AnalyticsPage({ searchParams }: Props) {
  const sb = service();
  const sp = (searchParams ? await searchParams : {}) as SearchParams;

  const sort = (sp.sort ?? "avg").toLowerCase(); // avg|points|matches|outcome|diff|exact|name|form
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

  // Качество (проценты точный/исход/разница) — оставляем из analytics_stage_user (это не про сумму очков)
  const { data: aggRows } = await sb
    .from("analytics_stage_user")
    .select("stage_id,user_id,matches_count,exact_count,outcome_hit_count,diff_hit_count")
    .eq("stage_id", stageId)
    .in("user_id", userIds);

  const aggMap = new Map<string, AggRow>();
  for (const a of (aggRows ?? []) as any[]) aggMap.set(a.user_id, a as AggRow);

  // Архетип
  const { data: archRows } = await sb
    .from("analytics_stage_user_archetype")
    .select("stage_id,user_id,archetype_key,title_ru,summary_ru,state,updated_at")
    .eq("stage_id", stageId)
    .in("user_id", userIds);

  const archMap = new Map<string, ArchRow>();
  for (const a of (archRows ?? []) as any[]) archMap.set(a.user_id, a as ArchRow);

  // ✅ КЛЮЧЕВОЕ: Очки/Матчи/Серия формы считаем из фактических начислений (points_ledger) по матчам текущего этапа
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
        away_score
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

  // агрегируем: суммы, count, серия по kickoff_at
  const perUserSum = new Map<string, number>();
  const perUserMatchSet = new Map<string, Set<number>>();
  const perUserSeries = new Map<string, Array<{ t: number; pts: number }>>();

  for (const r of (ledgerRows ?? []) as any as LedgerRow[]) {
    const m = r.matches;
    if (!m) continue;

    // считаем только завершённые матчи со счётом (как в текущей таблице)
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

  // строим cards
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

    // Форма: avg(last5) - avg(all)
    const allAvg = matches ? pointsSum / matches : 0;
    const lastN = 5;
    const tail = series.slice(-lastN);
    const lastAvg = tail.length ? sumNums(tail) / tail.length : 0;
    const momentum = tail.length >= 2 ? lastAvg - allAvg : 0; // чтобы не шуметь на 1 матче

    // quality rates — берём из analytics_stage_user, но нормируем по нашему matches (ledger) чтобы не расходилось
    // если agg.matches_count отличается — проценты будут “красивые”, но лучше честно: считаем по agg / agg.matches_count?
    // выберем компромисс: если agg.matches_count совпадает с matches — ок, иначе покажем по matches=agg.matches_count
    const qMatches = Number(agg?.matches_count ?? matches ?? 0) || 0;

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
  const topForm = pickTop(cards, (c) => c.momentum);
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
    if (sort === "form") return b.momentum - a.momentum;
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
                <li><b>График</b> — {TIP.spark}</li>
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
          <Link href={q({ sort: "form" })} className="appNavLink" title={TIP.form}>
            Форма
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

      {/* TOP: жестко 2 колонки */}
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

          {topForm ? (
            <TopMiniCard
              title="📈 Форма"
              href={`/analytics/${topForm.uid}`}
              name={topForm.name}
              value={fmtMomentum(topForm.momentum)}
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