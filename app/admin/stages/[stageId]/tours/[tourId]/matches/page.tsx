import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import CreateMatchForm from "./create-match-form";
import TourMatchesEditor from "./tour-matches-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function teamNameRel(rel: any): string {
  if (!rel) return "?";
  if (Array.isArray(rel)) return rel[0]?.name ?? "?";
  return rel.name ?? "?";
}

type TeamRow = {
  id: number;
  name: string;
};

type MatchRow = {
  id: number;
  kickoff_at: string | null;
  deadline_at: string | null;
  stage_match_no: number | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home: string;
  away: string;
};

export default async function AdminTourMatchesPage({
  params,
}: {
  params: Promise<{ stageId: string; tourId: string }>;
}) {
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");
  if (fpLogin !== "ADMIN") redirect("/dashboard");

  const { stageId, tourId } = await params;
  const sid = Number(stageId);
  const tid = Number(tourId);

  const sb = service();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("id", sid)
    .maybeSingle();

  const { data: tour } = await sb
    .from("tours")
    .select("id,stage_id,tour_no,name")
    .eq("id", tid)
    .maybeSingle();

  if (!stage || !tour || Number(tour.stage_id) !== sid) {
    return (
      <main className="page">
        <h1>Матчи тура</h1>
        <p style={{ color: "crimson", fontWeight: 800 }}>
          Тур или этап не найдены (или тур не принадлежит этапу).
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/admin/stages/${sid}/tours`}>← Назад к турам</Link>
        </p>
      </main>
    );
  }

  const { data: teamsRaw, error: teamsErr } = await sb
    .from("teams")
    .select("id,name")
    .order("name", { ascending: true });

  const { data: matchesRaw, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      stage_match_no,
      home_score,
      away_score,
      status,
      home_team_id,
      away_team_id,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", sid)
    .eq("tour_id", tid)
    .order("kickoff_at", { ascending: true })
    .order("id", { ascending: true });

  const teams: TeamRow[] = ((teamsRaw ?? []) as any[]).map((t) => ({
    id: Number(t.id),
    name: String(t.name),
  }));

  const matches: MatchRow[] =
    (matchesRaw ?? []).map((m: any) => ({
      id: Number(m.id),
      kickoff_at: m.kickoff_at ?? null,
      deadline_at: m.deadline_at ?? null,
      stage_match_no: m.stage_match_no ?? null,
      home_score: m.home_score ?? null,
      away_score: m.away_score ?? null,
      status: m.status ?? null,
      home_team_id: m.home_team_id == null ? null : Number(m.home_team_id),
      away_team_id: m.away_team_id == null ? null : Number(m.away_team_id),
      home: teamNameRel(m.home_team),
      away: teamNameRel(m.away_team),
    })) ?? [];

  return (
    <main className="page" style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href={`/admin/stages/${sid}/tours`}>← Назад к турам</Link>
      </p>

      <header style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>
          Тур {tour.tour_no}
          {tour.name ? ` — ${tour.name}` : ""}{" "}
          <span style={{ opacity: 0.7, fontWeight: 800 }}>
            (Этап #{stage.id}: {stage.name})
          </span>
        </h1>
        <div style={{ marginTop: 6, opacity: 0.85 }}>
          статус этапа: <b>{stage.status}</b> • матчей в туре: <b>{matches.length}</b>
        </div>
      </header>

      <section style={{ marginTop: 18 }}>
        <CreateMatchForm stageId={sid} tourId={tid} />
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900 }}>Матчи тура</h2>

        {teamsErr ? (
          <p style={{ color: "crimson", fontWeight: 800 }}>
            Ошибка загрузки команд: {teamsErr.message}
          </p>
        ) : mErr ? (
          <p style={{ color: "crimson", fontWeight: 800 }}>
            Ошибка загрузки матчей: {mErr.message}
          </p>
        ) : matches.length === 0 ? (
          <p style={{ opacity: 0.85, marginTop: 10 }}>Матчей пока нет — добавь через форму выше.</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            <TourMatchesEditor
              stageId={sid}
              tourId={tid}
              teams={teams}
              initialMatches={matches}
            />
          </div>
        )}
      </section>
    </main>
  );
}