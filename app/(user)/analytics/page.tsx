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

type StageRow = { id: number; name: string; status?: string | null };

type LoginAccountRow = { user_id: string; login: string };
type ProfileRow = { id: string; display_name: string | null };

type MatchRow = {
  id: number;
  stage_id: number;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
};

type PredRow = {
  match_id: number;
  user_id: string;
  home_pred: number | null;
  away_pred: number | null;
};

type LedgerRow = {
  match_id: number;
  user_id: string;
  points: number;
  reason: string | null;
};

type SearchParams = {
  sort?: string; // points|matches|exact|outcome|diff|name
};

type Props = {
  searchParams?: Promise<SearchParams>;
};

function sign(n: number) {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

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

export default async function AnalyticsPage({ searchParams }: Props) {
  const sb = service();
  const sp = (searchParams ? await searchParams : {}) as SearchParams;
  const sort = (sp.sort ?? "points").toLowerCase();

  // current stage
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

  // users (exclude ADMIN)
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
  ) as LoginAccountRow[];

  const userIds = Array.from(new Set(realAccounts.map((a) => a.user_id)));

  if (!userIds.length) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Нет участников для отображения.</p>
      </div>
    );
  }

  const { data: profiles } = await sb
    .from("profiles")
    .select("id,display_name")
    .in("id", userIds);

  const profMap = new Map<string, ProfileRow>();
  for (const p of (profiles ?? []) as ProfileRow[]) profMap.set(p.id, p);

  // finished matches in current stage
  const { data: matchesRaw, error: mErr } = await sb
    .from("matches")
    .select("id,stage_id,status,home_score,away_score")
    .eq("stage_id", stageId)
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  if (mErr) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Ошибка загрузки матчей: {mErr.message}</p>
      </div>
    );
  }

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => m.id);

  const finishedCnt = matchIds.length;

  // predictions for finished matches
  const { data: predsRaw } = await sb
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const preds = (predsRaw ?? []) as PredRow[];

  // ledger points (source of truth)
  const { data: ledgerRaw } = await sb
    .from("points_ledger")
    .select("match_id,user_id,points,reason")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const ledger = (ledgerRaw ?? []) as LedgerRow[];

  // build maps
  const matchMap = new Map<number, MatchRow>();
  for (const m of matches) matchMap.set(m.id, m);

  const predByMatchUser = new Map<number, Map<string, PredRow>>();
  for (const p of preds) {
    if (p.home_pred == null || p.away_pred == null) continue;
    if (!predByMatchUser.has(p.match_id)) predByMatchUser.set(p.match_id, new Map());
    predByMatchUser.get(p.match_id)!.set(p.user_id, p);
  }

  const ptsByMatchUser = new Map<number, Map<string, number>>();
  for (const r of ledger) {
    if (String(r.reason ?? "") !== "prediction") continue;
    if (!ptsByMatchUser.has(r.match_id)) ptsByMatchUser.set(r.match_id, new Map());
    ptsByMatchUser.get(r.match_id)!.set(r.user_id, Number(r.points ?? 0));
  }

  // compute stats per user
  const rows = userIds.map((uid) => {
    let matchesCount = 0;
    let pointsSum = 0;

    let exact = 0;
    let outcomeHit = 0;
    let diffHit = 0;

    for (const mid of matchIds) {
      const m = matchMap.get(mid);
      if (!m || m.home_score == null || m.away_score == null) continue;

      const pr = predByMatchUser.get(mid)?.get(uid);
      if (!pr) continue;

      matchesCount++;

      const pts = ptsByMatchUser.get(mid)?.get(uid) ?? 0;
      pointsSum += pts;

      const ph = Number(pr.home_pred);
      const pa = Number(pr.away_pred);

      if (ph === m.home_score && pa === m.away_score) exact++;

      const resSign = sign(m.home_score - m.away_score);
      const predSign = sign(ph - pa);
      if (resSign === predSign) outcomeHit++;

      const resDiff = m.home_score - m.away_score;
      const predDiff = ph - pa;
      if (resDiff === predDiff) diffHit++;
    }

    const acc = realAccounts.find((a) => a.user_id === uid);
    const prof = profMap.get(uid);

    const name =
      (prof?.display_name ?? "").trim() ||
      (acc?.login ?? "").trim() ||
      uid.slice(0, 8);

    return {
      uid,
      name,
      matchesCount,
      pointsSum: Math.round(pointsSum * 100) / 100,
      exactRate: safeDiv(exact, matchesCount),
      outcomeRate: safeDiv(outcomeHit, matchesCount),
      diffRate: safeDiv(diffHit, matchesCount),
    };
  });

  const sorted = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ru");
    if (sort === "matches") return (b.matchesCount ?? 0) - (a.matchesCount ?? 0);
    if (sort === "exact") return b.exactRate - a.exactRate;
    if (sort === "outcome") return b.outcomeRate - a.outcomeRate;
    if (sort === "diff") return b.diffRate - a.diffRate;
    // default points
    return (b.pointsSum ?? 0) - (a.pointsSum ?? 0);
  });

  const q = (nextSort: string) => `/analytics?sort=${encodeURIComponent(nextSort)}`;

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <h1>Аналитика</h1>
          <div className="pageMeta">
            Этап: <b>{stage.name}</b>
            {stage.status ? <span> · {stage.status}</span> : null}
            <span> · сыграно матчей: <b>{finishedCnt}</b></span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="appNavLink" href={q("points")}>Сорт: Очки</Link>
          <Link className="appNavLink" href={q("matches")}>Матчи</Link>
          <Link className="appNavLink" href={q("exact")}>Точный %</Link>
          <Link className="appNavLink" href={q("outcome")}>Исход %</Link>
          <Link className="appNavLink" href={q("diff")}>Разница %</Link>
          <Link className="appNavLink" href={q("name")}>Имя</Link>
        </div>
      </div>

      {finishedCnt === 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="cardBody">
            <b>Пока нет завершённых матчей.</b>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Аналитика появляется после того, как у матчей есть счёт и статус <code>finished</code>.
            </div>
          </div>
        </div>
      ) : null}

      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table className="table" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th className="thLeft">Участник</th>
              <th className="thCenter" style={{ width: 110 }}>Матчей</th>
              <th className="thCenter" style={{ width: 110 }}>Очки</th>
              <th className="thCenter" style={{ width: 120 }}>Точный</th>
              <th className="thCenter" style={{ width: 120 }}>Исход</th>
              <th className="thCenter" style={{ width: 120 }}>Разница</th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((r) => (
              <tr key={r.uid}>
                <td className="tdLeft">
                  <div style={{ fontWeight: 950 }}>
                    <Link href={`/analytics/${r.uid}`}>{r.name}</Link>
                  </div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}>
                    учтено матчей с прогнозом: <b>{r.matchesCount}</b>
                  </div>
                </td>

                <td className="tdCenter">
                  <span className="badge isNeutral">{r.matchesCount}</span>
                </td>

                <td className="tdCenter">
                  <b>{n2(r.pointsSum)}</b>
                </td>

                <td className="tdCenter">
                  <b>{pct01(r.exactRate)}</b>
                </td>

                <td className="tdCenter">
                  <b>{pct01(r.outcomeRate)}</b>
                </td>

                <td className="tdCenter">
                  <b>{pct01(r.diffRate)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link href="/dashboard" className="navLink">← Назад</Link>
      </div>
    </div>
  );
}