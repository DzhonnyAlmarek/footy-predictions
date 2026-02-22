import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ResultsClient from "./results-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TZ_MSK = "Europe/Moscow";

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

function fmtKickoffMsk(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    timeZone: TZ_MSK,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type StageRow = { id: number; name: string; status: string };
type MatchRow = {
  id: number;
  kickoff_at: string | null;
  status: string | null;
  stage_match_no: number | null;
  home_score: number | null;
  away_score: number | null;
  home_team: { name: string } | { name: string }[] | null;
  away_team: { name: string } | { name: string }[] | null;
};

type TeamObj = { name: string } | { name: string }[] | null;
function teamName(t: TeamObj): string {
  if (!t) return "?";
  const anyT: any = t as any;
  if (Array.isArray(anyT)) return String(anyT?.[0]?.name ?? "?");
  return String(anyT?.name ?? "?");
}

export default async function AdminResultsPage() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();

  // админ-страница: если не ADMIN — уводим
  if (!login || login !== "ADMIN") {
    redirect("/dashboard");
  }

  const sb = service();

  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle<StageRow>();

  if (sErr) {
    return (
      <main className="page" style={{ color: "crimson" }}>
        <h1>Результаты</h1>
        <p>Ошибка загрузки этапа: {sErr.message}</p>
      </main>
    );
  }

  if (!stage?.id) {
    return (
      <main className="page">
        <h1>Результаты</h1>
        <p>Текущий этап не выбран.</p>
      </main>
    );
  }

  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      status,
      stage_match_no,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stage.id)
    .order("kickoff_at", { ascending: true });

  if (mErr) {
    return (
      <main className="page" style={{ color: "crimson" }}>
        <h1>Результаты</h1>
        <p>Ошибка загрузки матчей: {mErr.message}</p>
      </main>
    );
  }

  const items = (matches ?? []).map((m: any) => {
    const row = m as MatchRow;
    return {
      id: Number(row.id),
      stage_match_no: row.stage_match_no ?? null,
      kickoff_at: row.kickoff_at,
      kickoff_msk: fmtKickoffMsk(row.kickoff_at),
      status: String(row.status ?? ""),
      home: teamName(row.home_team),
      away: teamName(row.away_team),
      home_score: row.home_score == null ? null : Number(row.home_score),
      away_score: row.away_score == null ? null : Number(row.away_score),
    };
  });

  return (
    <main className="page">
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Результаты</h1>
          <div className="pageMeta">
            Этап: <b>{stage.name}</b> · <span className="badge isNeutral">ADMIN</span>
          </div>
        </div>
      </header>

      <ResultsClient initialMatches={items} />
    </main>
  );
}