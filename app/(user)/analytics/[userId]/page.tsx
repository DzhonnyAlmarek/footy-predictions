import Link from "next/link";
import { notFound } from "next/navigation";
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

type Props = { params: Promise<{ userId: string }> };

type MatchRow = {
  id: number;
  kickoff_at: string | null;
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

function sign(n: number) {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

function pct(a: number, b: number) {
  if (!b) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

function n2(v: number) {
  return (Math.round(v * 100) / 100).toFixed(2);
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

  const { data: profile } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage?.id) {
    return (
      <div className="page">
        <h1>Аналитика</h1>
        <p>Текущий этап не выбран.</p>
        <div style={{ marginTop: 14 }}>
          <Link href="/analytics" className="navLink">← Назад к списку</Link>
        </div>
      </div>
    );
  }

  const stageId = Number(stage.id);

  const name =
    (profile?.display_name ?? "").trim() ||
    (account.login ?? "").trim() ||
    userId.slice(0, 8);

  // finished matches
  const { data: matchesRaw } = await sb
    .from("matches")
    .select("id,kickoff_at,stage_id,status,home_score,away_score")
    .eq("stage_id", stageId)
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .order("kickoff_at", { ascending: true });

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => m.id);

  const { data: predsRaw } = await sb
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .eq("user_id", userId)
    .in("match_id", matchIds);

  const preds = (predsRaw ?? []) as PredRow[];

  const { data: ledgerRaw } = await sb
    .from("points_ledger")
    .select("match_id,user_id,points,reason")
    .eq("user_id", userId)
    .in("match_id", matchIds);

  const ledger = (ledgerRaw ?? []) as LedgerRow[];

  const predByMatch = new Map<number, PredRow>();
  for (const p of preds) {
    if (p.home_pred == null || p.away_pred == null) continue;
    predByMatch.set(p.match_id, p);
  }

  const ptsByMatch = new Map<number, number>();
  for (const r of ledger) {
    if (String(r.reason ?? "") !== "prediction") continue;
    ptsByMatch.set(r.match_id, Number(r.points ?? 0));
  }

  let matchesCount = 0;
  let exact = 0;
  let outcome = 0;
  let diff = 0;
  let pointsSum = 0;

  const perMatch = matches.map((m) => {
    const pr = predByMatch.get(m.id);
    const pts = ptsByMatch.get(m.id) ?? 0;

    const hasPred = !!pr;
    const predText = pr ? `${pr.home_pred}:${pr.away_pred}` : "—";
    const resText = `${m.home_score}:${m.away_score}`;

    let exactHit = false;
    let outcomeHit = false;
    let diffHit = false;

    if (hasPred && m.home_score != null && m.away_score != null) {
      matchesCount++;
      pointsSum += pts;

      const ph = Number(pr!.home_pred);
      const pa = Number(pr!.away_pred);

      exactHit = ph === m.home_score && pa === m.away_score;

      const resSign = sign(m.home_score - m.away_score);
      const predSign = sign(ph - pa);
      outcomeHit = resSign === predSign;

      const resDiff = m.home_score - m.away_score;
      const predDiff = ph - pa;
      diffHit = resDiff === predDiff;

      if (exactHit) exact++;
      if (outcomeHit) outcome++;
      if (diffHit) diff++;
    }

    return {
      matchId: m.id,
      predText,
      resText,
      pts: Math.round(pts * 100) / 100,
      hasPred,
      exactHit,
      outcomeHit,
      diffHit,
    };
  });

  pointsSum = Math.round(pointsSum * 100) / 100;

  return (
    <div className="page">
      <h1>{name}</h1>

      <div className="pageMeta">
        Этап: <b>{stage.name}</b>
        {stage.status ? <span> · {stage.status}</span> : null}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardBody">
          <div className="kpiRow">
            <div className="kpi">
              <div className="kpiLabel">Матчей учтено</div>
              <div className="kpiValue">{matchesCount}</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Очки</div>
              <div className="kpiValue">{n2(pointsSum)}</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Точный</div>
              <div className="kpiValue">{pct(exact, matchesCount)}</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Исход</div>
              <div className="kpiValue">{pct(outcome, matchesCount)}</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Разница</div>
              <div className="kpiValue">{pct(diff, matchesCount)}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="analyticsSectionTitle">Матчи</div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table" style={{ minWidth: 740 }}>
            <thead>
              <tr>
                <th className="thCenter" style={{ width: 90 }}>Match</th>
                <th className="thCenter" style={{ width: 120 }}>Прогноз</th>
                <th className="thCenter" style={{ width: 120 }}>Результат</th>
                <th className="thCenter" style={{ width: 110 }}>Очки</th>
                <th className="thCenter" style={{ width: 120 }}>Точный</th>
                <th className="thCenter" style={{ width: 120 }}>Исход</th>
                <th className="thCenter" style={{ width: 120 }}>Разница</th>
              </tr>
            </thead>

            <tbody>
              {perMatch.map((r) => (
                <tr key={r.matchId}>
                  <td className="tdCenter">
                    <Link href={`/match/${r.matchId}`}>#{r.matchId}</Link>
                  </td>
                  <td className="tdCenter">
                    <b>{r.predText}</b>
                    {!r.hasPred ? <div style={{ opacity: 0.7, marginTop: 2 }}>нет прогноза</div> : null}
                  </td>
                  <td className="tdCenter">
                    <b>{r.resText}</b>
                  </td>
                  <td className="tdCenter">
                    <b>{n2(r.pts)}</b>
                  </td>
                  <td className="tdCenter">{r.exactHit ? "✅" : "—"}</td>
                  <td className="tdCenter">{r.outcomeHit ? "✅" : "—"}</td>
                  <td className="tdCenter">{r.diffHit ? "✅" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14 }}>
          <Link href="/analytics" className="navLink">← Назад к списку</Link>
        </div>
      </div>
    </div>
  );
}