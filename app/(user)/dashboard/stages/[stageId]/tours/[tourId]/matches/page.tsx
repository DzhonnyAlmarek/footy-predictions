import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BulkPredictions from "./bulk-predictions";

export default async function UserTourMatchesPage({
  params,
}: {
  params: Promise<{ stageId: string; tourId: string }>;
}) {
  const { stageId, tourId } = await params;
  const sid = Number(stageId);
  const tid = Number(tourId);

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  // этап должен быть published
  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("id", sid)
    .eq("status", "published")
    .maybeSingle();

  if (!stage) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "crimson" }}>Этап не найден или не опубликован.</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/dashboard/stages">← К этапам</Link>
        </p>
      </main>
    );
  }

  // тур должен принадлежать этапу
  const { data: tour } = await supabase
    .from("tours")
    .select("id,stage_id,tour_no,name")
    .eq("id", tid)
    .eq("stage_id", sid)
    .maybeSingle();

  if (!tour) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "crimson" }}>Тур не найден.</p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/dashboard/stages/${sid}/tours`}>← К турам</Link>
        </p>
      </main>
    );
  }

  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      status,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name, slug ),
      away_team:teams!matches_away_team_id_fkey ( name, slug )
    `
    )
    .eq("tour_id", tid)
    .eq("stage_id", sid)
    .order("kickoff_at", { ascending: true });

  // мои прогнозы по этим матчам
  let predMap = new Map<number, { home: number; away: number; updated_at: string }>();

  if (user && matches && matches.length > 0) {
    const matchIds = matches.map((m: any) => m.id);

    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id, home_pred, away_pred, updated_at")
      .eq("user_id", user.id)
      .in("match_id", matchIds);

    for (const p of preds ?? []) {
      predMap.set(p.match_id, {
        home: p.home_pred,
        away: p.away_pred,
        updated_at: p.updated_at,
      });
    }
  }

  // данные для bulk-виджета
  const bulkMatches =
    (matches ?? []).map((m: any) => {
      const myPred = predMap.get(m.id);
      return {
        id: m.id,
        deadline_at: m.deadline_at,
        home_name: m.home_team?.name ?? "?",
        away_name: m.away_team?.name ?? "?",
        my_home: myPred ? myPred.home : null,
        my_away: myPred ? myPred.away : null,
      };
    });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href={`/dashboard/stages/${sid}/tours`}>← К турам</Link>
      </p>

      <header style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>{stage.name}</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Тур {tour.tour_no}{tour.name ? ` — ${tour.name}` : ""}
        </p>
      </header>

      {/* Быстрый ввод прогнозов */}
      <section style={{ marginTop: 18 }}>
        <BulkPredictions matches={bulkMatches} />
      </section>

      {error && (
        <p style={{ marginTop: 16, color: "crimson" }}>Ошибка матчей: {error.message}</p>
      )}

      {/* Список матчей тура */}
      <section style={{ marginTop: 24 }}>
        {!matches || matches.length === 0 ? (
          <p>В этом туре матчей пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {matches.map((m: any) => {
              const kickoff = new Date(m.kickoff_at);
              const deadline = new Date(m.deadline_at);
              const isOpen = new Date() < deadline;

              const finalScore =
                m.home_score === null || m.away_score === null ? null : `${m.home_score}:${m.away_score}`;

              const myPred = predMap.get(m.id);

              return (
                <Link
                  key={m.id}
                  href={`/match/${m.id}`}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 14,
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.8 }}>
                        kickoff:{" "}
                        {kickoff.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                      </div>

                      <div style={{ marginTop: 4, opacity: 0.8 }}>
                        дедлайн:{" "}
                        {deadline.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })} •{" "}
                        <b style={{ color: isOpen ? "inherit" : "crimson" }}>
                          {isOpen ? "приём открыт" : "приём закрыт"}
                        </b>
                      </div>

                      {finalScore && (
                        <div style={{ marginTop: 4, opacity: 0.85 }}>
                          итог: <b>{finalScore}</b>
                        </div>
                      )}
                    </div>

                    <div style={{ alignSelf: "center", textAlign: "right", minWidth: 160 }}>
                      <div style={{ fontWeight: 800, opacity: 0.8 }}>Мой прогноз</div>
                      <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>
                        {myPred ? `${myPred.home}:${myPred.away}` : "—"}
                      </div>
                      <div style={{ marginTop: 8, opacity: 0.8, textDecoration: "underline" }}>
                        Открыть →
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
