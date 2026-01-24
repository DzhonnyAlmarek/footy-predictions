import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PredictionForm from "./prediction-form";
import AllPredictions from "./all-predictions";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const matchId = Number(id);

  if (!Number.isFinite(matchId)) {
    return (
      <main style={{ padding: 24 }}>
        <p>Неверный id матча</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/">← На главную</Link>
        </p>
      </main>
    );
  }

  const supabase = await createClient();

  const { data: match, error } = await supabase
    .from("matches")
    .select(
      `
      id,
      stage_id,
      tour_id,
      kickoff_at,
      deadline_at,
      status,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( id, name, slug ),
      away_team:teams!matches_away_team_id_fkey ( id, name, slug )
    `
    )
    .eq("id", matchId)
    .single();

  if (error || !match) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "crimson" }}>
          Матч не найден{error ? `: ${error.message}` : ""}
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href="/">← Назад</Link>
        </p>
      </main>
    );
  }

  // подтягиваем этап/тур (если есть)
  let stageInfo: { id: number; name: string } | null = null;
  let tourInfo: { id: number; tour_no: number; name: string | null } | null = null;

  if (match.stage_id) {
    const { data: st } = await supabase
      .from("stages")
      .select("id,name")
      .eq("id", match.stage_id)
      .maybeSingle();

    if (st) stageInfo = st;
  }

  if (match.tour_id) {
    const { data: tr } = await supabase
      .from("tours")
      .select("id,tour_no,name")
      .eq("id", match.tour_id)
      .maybeSingle();

    if (tr) tourInfo = tr;
  }

  const kickoff = new Date(match.kickoff_at);
  const deadline = new Date(match.deadline_at);
  const now = new Date();
  const isOpen = now < deadline;

  const finalScore =
    match.home_score === null || match.away_score === null
      ? null
      : `${match.home_score}:${match.away_score}`;

  // мои очки за матч
  const { data: userData } = await supabase.auth.getUser();
  let myPoints: number | null = null;
  let myReason: string | null = null;

  if (userData.user) {
    const { data: pl } = await supabase
      .from("points_ledger")
      .select("points, reason")
      .eq("match_id", matchId)
      .maybeSingle();

    if (pl) {
      myPoints = pl.points ?? 0;
      myReason = pl.reason ?? null;
    }
  }

  const backToTour =
    stageInfo && tourInfo
      ? `/dashboard/stages/${stageInfo.id}/tours/${tourInfo.id}/matches`
      : null;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <p style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {backToTour ? (
          <Link href={backToTour}>← Назад в тур</Link>
        ) : (
          <Link href="/dashboard/matches">← К матчам</Link>
        )}
        <Link href="/dashboard/stages">Этапы</Link>
      </p>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>
        {match.home_team.name} — {match.away_team.name}
      </h1>

      {(stageInfo || tourInfo) && (
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          {stageInfo ? (
            <>
              Этап: <b>{stageInfo.name}</b>
            </>
          ) : null}
          {stageInfo && tourInfo ? " • " : null}
          {tourInfo ? (
            <>
              Тур: <b>{tourInfo.tour_no}{tourInfo.name ? ` — ${tourInfo.name}` : ""}</b>
            </>
          ) : null}
        </p>
      )}

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        статус: {match.status}
        {finalScore ? ` • итог: ${finalScore}` : ""}
      </p>

      <div
        style={{
          marginTop: 16,
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div>
          <b>Kickoff:</b>{" "}
          {kickoff.toLocaleString("ru-RU", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
        <div style={{ marginTop: 6 }}>
          <b>Дедлайн:</b>{" "}
          {deadline.toLocaleString("ru-RU", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
        <div style={{ marginTop: 6 }}>
          <b>Статус приёма прогнозов:</b>{" "}
          {isOpen ? "открыто" : "закрыто"}
        </div>

        {userData.user && (
          <div style={{ marginTop: 10 }}>
            <b>Мои очки за матч:</b>{" "}
            {myPoints === null ? (
              <span style={{ opacity: 0.8 }}>ещё не начислены</span>
            ) : (
              <>
                <span style={{ fontWeight: 900 }}>{myPoints}</span>
                {myReason ? <span style={{ opacity: 0.8 }}> ({myReason})</span> : null}
              </>
            )}
          </div>
        )}
      </div>

      {/* МОЙ ПРОГНОЗ */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Ваш прогноз</h2>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Чтобы сохранить прогноз, нужно быть залогиненным. После дедлайна изменить нельзя.
        </p>

        <div style={{ marginTop: 12 }}>
          <PredictionForm
            matchId={matchId}
            homeName={match.home_team.name}
            awayName={match.away_team.name}
            deadlineAt={match.deadline_at}
          />
        </div>
      </section>

      {/* ВСЕ ПРОГНОЗЫ ПОСЛЕ ДЕДЛАЙНА */}
      <section style={{ marginTop: 24 }}>
        <AllPredictions matchId={matchId} deadlineAt={match.deadline_at} />
      </section>
    </main>
  );
}
