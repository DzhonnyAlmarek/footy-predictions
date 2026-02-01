import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MatchRowActions from "./match-row-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminTourMatchesPage({
  params,
}: {
  params: Promise<{ stageId: string; tourId: string }>;
}) {
  const { stageId: stageIdStr, tourId: tourIdStr } = await params;

  const stageId = Number(stageIdStr);
  const tourId = Number(tourIdStr);

  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name")
    .eq("id", stageId)
    .maybeSingle();

  const { data: tour } = await supabase
    .from("tours")
    .select("id,tour_no,name")
    .eq("id", tourId)
    .maybeSingle();

  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      `
      id, stage_id, tour_id, stage_match_no, kickoff_at, deadline_at, status,
      home_team_id, away_team_id,
      home_score, away_score,
      home_team:teams!matches_home_team_id_fkey(name),
      away_team:teams!matches_away_team_id_fkey(name)
    `
    )
    .eq("tour_id", tourId)
    .order("stage_match_no", { ascending: true });

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Link href={`/admin/stages/${stageId}/tours`} style={{ textDecoration: "underline" }}>
          ← Назад к турам
        </Link>
        <Link href="/admin/stages" style={{ textDecoration: "underline" }}>
          Этапы
        </Link>
      </div>

      <h1 style={{ marginTop: 12, fontSize: 26, fontWeight: 900 }}>
        Матчи тура {tour?.tour_no ?? "?"}
        {tour?.name ? ` — ${tour.name}` : ""}
      </h1>

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Этап: <b>{stage?.name ?? "?"}</b>
      </p>

      {error ? <p style={{ marginTop: 12, color: "crimson" }}>Ошибка: {error.message}</p> : null}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {(matches ?? []).map((m: any) => (
          <div key={m.id} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900 }}>
              {m.stage_match_no}. {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
            </div>

            <div style={{ marginTop: 10 }}>
              <MatchRowActions
                matchId={m.id}
                kickoffAt={m.kickoff_at}
                homeScore={m.home_score}
                awayScore={m.away_score}
                homeTeamId={m.home_team_id}
                awayTeamId={m.away_team_id}
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
