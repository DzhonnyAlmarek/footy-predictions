import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResultsEditor from "./results-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// ✅ самое важное: убираем кэш fetch на уровне страницы
export const fetchCache = "force-no-store";

type TeamObj = { name: string } | { name: string }[] | null;

type MatchRow = {
  id: number;
  stage_match_no?: number | null;
  kickoff_at?: string | null;
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_team?: TeamObj;
  away_team?: TeamObj;
};

export default async function AdminResultsPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage?.id) {
    return (
      <main className="userMain hasBottomBar">
        <h1 style={{ fontWeight: 900, margin: 0 }}>Результаты</h1>
        <p style={{ marginTop: 10, opacity: 0.8 }}>Текущий этап не выбран.</p>
      </main>
    );
  }

  // ✅ сортировка: сначала stage_match_no, затем kickoff
  const { data: matchesRaw, error } = await supabase
    .from("matches")
    .select(
      `
      id,
      stage_match_no,
      kickoff_at,
      status,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stage.id)
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (error) {
    return (
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
        Ошибка загрузки матчей: {error.message}
      </main>
    );
  }

  const matches = (matchesRaw ?? []) as unknown as MatchRow[];

  return (
    <main className="userMain hasBottomBar">
      <h1 style={{ fontWeight: 900, margin: 0 }}>Результаты</h1>
      <div style={{ marginTop: 6, opacity: 0.8 }}>
        Этап: <b>{stage.name ?? `#${stage.id}`}</b>
        {stage.status ? <span style={{ opacity: 0.65 }}> • {stage.status}</span> : null}
      </div>

      <div style={{ marginTop: 14 }}>
        <ResultsEditor stageId={Number(stage.id)} matches={matches} />
      </div>
    </main>
  );
}
