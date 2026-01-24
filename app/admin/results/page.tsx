import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import ResultsEditor from "./results-editor";

export default async function AdminResultsPage() {
  const supabase = await createClient();

  // текущий этап — только вручную
  const { data: stage, error: stageErr } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (stageErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Результаты</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>Ошибка: {stageErr.message}</p>
      </main>
    );
  }

  if (!stage) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Результаты</h1>
        <p style={{ marginTop: 12 }}>Текущий этап не выбран.</p>
        <p style={{ marginTop: 12 }}>
          Перейдите в <Link href="/admin/stages">Этапы</Link> и нажмите <b>«Сделать текущим»</b>.
        </p>
      </main>
    );
  }

  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      `
      id,
      stage_id,
      stage_match_no,
      kickoff_at,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stage.id)
    .order("stage_match_no", { ascending: true })
    .limit(200);

  if (error) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Результаты</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>Ошибка: {error.message}</p>
      </main>
    );
  }

  const rows =
    (matches ?? []).map((m: any) => ({
      id: m.id as number,
      stageMatchNo: (m.stage_match_no ?? null) as number | null,
      kickoffAt: m.kickoff_at as string,
      homeName: m.home_team?.name ?? "?",
      awayName: m.away_team?.name ?? "?",
      homeScore: m.home_score as number | null,
      awayScore: m.away_score as number | null,
    })) ?? [];

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Результаты</h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>
          Этап: <b>{stage.name}</b> • статус: <b>{stage.status}</b>
        </p>
      </header>

      <section style={{ marginTop: 18 }}>
        <ResultsEditor matches={rows} />
      </section>
    </main>
  );
}
