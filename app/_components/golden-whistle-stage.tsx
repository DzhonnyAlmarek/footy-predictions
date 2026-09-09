import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { basePredictionPoints, formatWhistlePoints, goldenWhistlePoints } from "@/lib/golden-whistle";
import { stageStatusLabel } from "@/lib/user-labels";
import GoldenWhistleCalculation from "@/app/_components/golden-whistle-calculation";

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function service() {
  return createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function medal(index: number) {
  return index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
}

export default async function GoldenWhistleStage({
  stageId,
  stageName,
  stageStatus,
  backHref,
}: {
  stageId: number;
  stageName: string;
  stageStatus?: string | null;
  backHref: string;
}) {
  const sb = service();
  const [{ data: users }, { data: matches }] = await Promise.all([
    sb.from("login_accounts").select("login,user_id").neq("login", "ADMIN").order("login"),
    sb.from("matches")
      .select("id,home_score,away_score,home_penalty_goals,away_penalty_goals")
      .eq("stage_id", stageId)
      .eq("status", "finished"),
  ]);

  const userRows = (users ?? []).map((u: any) => ({ login: String(u.login), userId: String(u.user_id) }));
  const matchRows = (matches ?? []).filter((m: any) => m.home_score != null && m.away_score != null);
  const matchIds = matchRows.map((m: any) => Number(m.id));
  const userIds = userRows.map((u) => u.userId);

  const [{ data: predictions }, { data: ledger }] = matchIds.length && userIds.length
    ? await Promise.all([
        sb.from("predictions").select("match_id,user_id,home_pred,away_pred").in("match_id", matchIds).in("user_id", userIds),
        sb.from("points_ledger").select("match_id,user_id,points").in("match_id", matchIds).in("user_id", userIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  const matchById = new Map(matchRows.map((m: any) => [Number(m.id), m]));
  const ledgerByKey = new Map((ledger ?? []).map((r: any) => [`${r.match_id}:${r.user_id}`, Number(r.points ?? 0)]));
  const mainTotalByUser = new Map<string, number>();
  for (const r of ledger ?? []) {
    const uid = String(r.user_id);
    mainTotalByUser.set(uid, (mainTotalByUser.get(uid) ?? 0) + Number(r.points ?? 0));
  }

  const mainRanking = [...userRows].sort((a, b) =>
    (mainTotalByUser.get(b.userId) ?? 0) - (mainTotalByUser.get(a.userId) ?? 0) ||
    a.login.localeCompare(b.login, "ru")
  );
  const mainPlace = new Map(mainRanking.map((u, index) => [u.userId, index + 1]));
  const whistleByUser = new Map<string, number>();

  for (const p of predictions ?? []) {
    const match: any = matchById.get(Number(p.match_id));
    if (!match) continue;
    const homePens = Number(match.home_penalty_goals ?? 0);
    const awayPens = Number(match.away_penalty_goals ?? 0);
    if (homePens + awayPens === 0) continue;

    const pointsWithPenalties = basePredictionPoints(
      Number(p.home_pred), Number(p.away_pred),
      Number(match.home_score), Number(match.away_score)
    );
    const pointsWithoutPenalties = basePredictionPoints(
      Number(p.home_pred), Number(p.away_pred),
      Number(match.home_score) - homePens,
      Number(match.away_score) - awayPens
    );
    const actualPoints = ledgerByKey.get(`${p.match_id}:${p.user_id}`) ?? 0;
    const earned = goldenWhistlePoints(actualPoints, pointsWithPenalties, pointsWithoutPenalties);
    const uid = String(p.user_id);
    whistleByUser.set(uid, Math.round(((whistleByUser.get(uid) ?? 0) + earned) * 100) / 100);
  }

  const rows = userRows.map((u) => ({
    ...u,
    points: whistleByUser.get(u.userId) ?? 0,
    mainPoints: mainTotalByUser.get(u.userId) ?? 0,
    mainPlace: mainPlace.get(u.userId) ?? userRows.length,
  })).sort((a, b) => b.points - a.points || b.mainPlace - a.mainPlace || a.login.localeCompare(b.login, "ru"));

  const penaltyMatches = matchRows.filter((m: any) => Number(m.home_penalty_goals ?? 0) + Number(m.away_penalty_goals ?? 0) > 0).length;

  return (
    <main className="page">
      <div className="card">
        <div className="cardHeader">
          <div className="cardTitle">Золотой свисток</div>
          <div className="cardSub">Этап: <b>{stageName}</b>{stageStatus ? ` • ${stageStatusLabel(stageStatus)}` : ""} • матчей с пенальти: {penaltyMatches}</div>
        </div>
        <div className="cardBody">
          <div className="cardSoft" style={{ marginBottom: 16 }}>
            Учитываются только положительные прибавки к баллам, которые дали забитые пенальти. Контрольный расчёт выполняется без коэффициентов.
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left" }}><th style={{ padding: "8px 10px", width: 80 }}>#</th><th style={{ padding: "8px 10px" }}>Участник</th><th style={{ padding: "8px 10px", textAlign: "right" }}>Баллы</th><th style={{ padding: "8px 10px", textAlign: "right" }}>Место в основном конкурсе</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.userId} style={{ borderTop: "1px solid rgba(0,0,0,.08)", background: index < 3 ? "rgba(0,0,0,.03)" : "transparent" }}><td style={{ padding: "8px 10px", fontWeight: 900 }}>{index + 1} {medal(index)}</td><td style={{ padding: "8px 10px", fontWeight: 900 }}>{row.login}</td><td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900 }}>{formatWhistlePoints(row.points)}</td><td style={{ padding: "8px 10px", textAlign: "right" }}>{row.mainPlace}</td></tr>)}</tbody>
          </table>
          <GoldenWhistleCalculation stageId={stageId} />
          <div style={{ marginTop: 16 }}><Link href={backHref}>← Назад к таблице</Link></div>
        </div>
      </div>
    </main>
  );
}
