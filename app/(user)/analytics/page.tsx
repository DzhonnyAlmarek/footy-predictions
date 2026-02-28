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

  points_sum: number; // очки за этап
  points_avg: number; // средние очки

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

/* ---------- user-level tips (no dev jargon) ---------- */

const TIP = {
  updated:
    "Когда статистика последний раз обновлялась после сыгранного матча.",
  matches:
    "Сколько сыгранных матчей уже учтено именно для вас. Матч считается, если он завершён и у вас был заполнен прогноз.",
  points:
    "Сколько очков вы набрали за учтённые матчи этапа.",
  avgPoints:
    "Среднее число очков за один учтённый матч. Удобно сравнивать участников, если матчей учтено разное число.",
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
  pointsCheck:
    "Проверка: сравниваем “Очки” со суммой очков по матчам. Если есть ⚠️ — значит где-то ещё не обновилось или есть расхождение в учёте матчей.",
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
    .select("stage_id,user_id,matches_count,points_sum,points_avg,exact_count,outcome_hit_count,diff_hit_count")
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

    const matches = Number(agg?.matches_count ?? 0);
    const pointsSum = Number(agg?.points_sum ?? 0);

    // IMPORTANT: avg показываем как pointsSum/matches (на всякий случай), а не как "points_avg" (чтобы не было рассинхрона)
    const avgPoints = matches ? pointsSum / matches : 0;

    const exactRate = safeDiv(Number(agg?.exact_count ?? 0), matches);
    const outcomeRate = safeDiv(Number(agg?.outcome_hit_count ?? 0), matches);
    const diffRate = safeDiv(Number(agg?.diff_hit_count ?? 0), matches);

    const seriesRaw = mom?.momentum_series ?? [];
    const series = Array.isArray(seriesRaw) ? seriesRaw.map((x: any) => Number(x ?? 0)) : [];
    const seriesSum = sumNums(series);

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
      avgPoints,
      exactRate,
      outcomeRate,
      diffRate,
      series,
      seriesSum,
      momentum,
      archetype_key,
      title_ru,
      summary_ru,
      state,
    };
  });

  // TOP (6 плиток): выбираем лидеров по метрикам
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

  const updated = baseline?.updated_at ? new Date(baseline.updated_at).toLocaleString("ru-RU") : "—";

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

  // Для “проверки очков”: сравним pointsSum с суммой серии (если серия есть)
  function pointsMismatch(pointsSum: number, seriesSum: number, seriesLen: number) {
    if (!seriesLen) return false;
    return Math.abs(pointsSum - seriesSum) > 0.01;
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

          <Link href={q({ sort: "avg" })} className="appNavLink" title={TIP.avgPoints}>Сорт: Средние очки</Link>
          <Link href={q({ sort: "form" })} className="appNavLink" title={TIP.form}>Форма</Link>
          <Link href={q({ sort: "points" })} className="appNavLink" title={TIP.points}>Очки</Link>
          <Link href={q({ sort: "matches" })} className="appNavLink" title={TIP.matches}>Матчи</Link>
          <Link href={q({ sort: "outcome" })} className="appNavLink" title={TIP.outcome}>Исход%</Link>
          <Link href={q({ sort: "diff" })} className="appNavLink" title={TIP.diff}>Разн.%</Link>
          <Link href={q({ sort: "exact" })} className="appNavLink" title={TIP.exact}>Точный%</Link>
          <Link href={q({ sort: "name" })} className="appNavLink">Имя</Link>
        </div>
      </div>

      {/* TOP: 2 колонки × 3 ряда */}
      <div style={{ marginTop: 14 }}>
        <div className="analyticsSectionTitle">TOP по этапу</div>

        <div
          className="analyticsTopGrid"
          style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" as any, gap: 10 }}
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
              const mismatch = pointsMismatch(c.pointsSum, c.seriesSum, c.series.length);

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

                        <div style={{ fontSize: 12, opacity: 0.8 }} title={TIP.pointsCheck}>
                          {mismatch ? (
                            <span style={{ fontWeight: 900 }}>
                              ⚠️ проверка очков: {n2(c.seriesSum)}
                            </span>
                          ) : (
                            <span>проверка очков: {n2(c.seriesSum)}</span>
                          )}
                        </div>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mode === "details" ? (
        <div className="analyticsHintSmall" title={TIP.pointsCheck}>
          Если рядом с “проверка очков” есть ⚠️ — значит сейчас есть расхождение в учёте матчей/обновлении данных.
          Обычно помогает повторный пересчёт последнего матча (через “Счёт”).
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