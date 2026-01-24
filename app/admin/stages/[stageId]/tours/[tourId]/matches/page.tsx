import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateMatchInTourForm from "./create-match-form";
import MatchRowActions from "./match-row-actions";

export default async function AdminTourMatchesPage({
  params,
}: {
  params: Promise<{ stageId: string; tourId: string }>;
}) {
  const { stageId, tourId } = await params;
  const sid = Number(stageId);
  const tid = Number(tourId);

  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status,matches_required")
    .eq("id", sid)
    .maybeSingle();

  const { data: tour, error: tourErr } = await supabase
    .from("tours")
    .select("id,stage_id,tour_no,name")
    .eq("id", tid)
    .eq("stage_id", sid)
    .single();

  if (tourErr || !tour || !stage) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "crimson" }}>Тур/этап не найден.</p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/admin/stages/${sid}/tours`}>← К турам этапа</Link>
        </p>
      </main>
    );
  }

  const { count: stageMatchCount } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", sid);

  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      `
      id,
      stage_match_no,
      kickoff_at,
      deadline_at,
      status,
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( id, name ),
      away_team:teams!matches_away_team_id_fkey ( id, name )
    `
    )
    .eq("tour_id", tid)
    .order("kickoff_at", { ascending: true });

  const { data: teams } = await supabase
    .from("teams")
    .select("id,name,slug")
    .order("name", { ascending: true });

  // usedTeamIds: команды, уже задействованные в этом туре
  const usedTeamIds = Array.from(
    new Set(
      (matches ?? [])
        .flatMap((m: any) => [m.home_team_id, m.away_team_id])
        .filter((x: any) => typeof x === "number")
    )
  ) as number[];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href={`/admin/stages/${sid}/tours`}>← К турам этапа</Link>
      </p>

      <header style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>
          Этап #{stage.id}: {stage.name}
        </h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>
          статус: <b>{stage.status}</b> • матчей в этапе:{" "}
          <b>{stageMatchCount ?? 0}</b> / {stage.matches_required}
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 14 }}>
          Тур {tour.tour_no}{tour.name ? ` — ${tour.name}` : ""}
        </h2>
      </header>

      <section style={{ marginTop: 18 }}>
        <CreateMatchInTourForm
          stageId={sid}
          tourId={tid}
          stageStatus={stage.status}
          teams={(teams ?? []).map((t: any) => ({ id: t.id, name: t.name, slug: t.slug ?? "" }))}
          usedTeamIds={usedTeamIds}
        />
      </section>

      {error && (
        <p style={{ marginTop: 16, color: "crimson" }}>
          Ошибка загрузки матчей: {error.message}
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        {!matches || matches.length === 0 ? (
          <p>В этом туре матчей пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {matches.map((m: any) => {
              const kickoff = new Date(m.kickoff_at);
              const score =
                m.home_score === null || m.away_score === null ? "—" : `${m.home_score}:${m.away_score}`;

              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 340 }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>
                      {(m.stage_match_no ?? "—")}. {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.8 }}>
                      дата матча (дедлайн):{" "}
                      {kickoff.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.8 }}>
                      status: <b>{m.status}</b> • счёт: <b>{score}</b>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Link href={`/match/${m.id}`} style={{ textDecoration: "underline" }}>
                        Открыть матч →
                      </Link>
                    </div>
                  </div>

                  <div style={{ minWidth: 360 }}>
                    <MatchRowActions
                      stageStatus={stage.status}
                      matchId={m.id}
                      initialHomeTeamId={m.home_team_id}
                      initialAwayTeamId={m.away_team_id}
                      initialKickoffAt={m.kickoff_at}
                      initialDeadlineAt={m.deadline_at}
                      initialStatus={m.status}
                      teams={(teams ?? []).map((t: any) => ({ id: t.id, name: t.name }))}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
