import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import ResultsEditor from "./results-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/* ===== utils ===== */

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

type TeamObj = { name: string } | { name: string }[] | null;

export type MatchRow = {
  id: number;
  stage_id?: number | null;
  stage_match_no?: number | null;
  kickoff_at?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_team?: TeamObj;
  away_team?: TeamObj;
};

export default async function AdminResultsPage() {
  // ✅ admin auth via fp_login cookie (как в других админ-страницах)
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");
  if (fpLogin !== "ADMIN") redirect("/dashboard");

  const sb = service();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage?.id) {
    return (
      <main className="page">
        <h1>Результаты</h1>
        <p className="pageMeta">Текущий этап не выбран.</p>
      </main>
    );
  }

  const { data: matchesRaw, error } = await sb
    .from("matches")
    .select(
      `
      id,
      stage_match_no,
      kickoff_at,
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
      <main className="page">
        <h1>Результаты</h1>
        <p style={{ color: "crimson", marginTop: 10, fontWeight: 800 }}>
          Ошибка загрузки матчей: {error.message}
        </p>
      </main>
    );
  }

  const matches = (matchesRaw ?? []) as unknown as MatchRow[];

  return (
    <main className="page">
      <h1>Результаты</h1>
      <div className="pageMeta">
        Этап: <b>{stage.name ?? `#${stage.id}`}</b>
        {stage.status ? <span> • {stage.status}</span> : null}
        <span> • Матчей: {matches.length}</span>
      </div>

      <div style={{ marginTop: 14 }}>
        <ResultsEditor stageId={Number(stage.id)} matches={matches} />
      </div>
    </main>
  );
}
