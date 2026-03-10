import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import EditMatchForm from "./edit-match-form";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string) {
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

export default async function AdminEditMatchPage({
  params,
}: {
  params: Promise<{ stageId: string; tourId: string; matchId: string }>;
}) {
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");
  if (fpLogin !== "ADMIN") redirect("/dashboard");

  const { stageId, tourId, matchId } = await params;

  const sid = Number(stageId);
  const tid = Number(tourId);
  const mid = Number(matchId);

  const supabase = service();

  const { data: match, error } = await supabase
    .from("matches")
    .select(`
      id,
      stage_id,
      tour_id,
      stage_match_no,
      kickoff_at,
      deadline_at,
      status,
      home_team_id,
      away_team_id,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `)
    .eq("id", mid)
    .single();

  if (error || !match) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "crimson" }}>
          Матч не найден{error ? `: ${error.message}` : ""}
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/admin/stages/${sid}`}>← Назад к этапу</Link>
        </p>
      </main>
    );
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id,name")
    .order("name", { ascending: true });

  const { data: tours } = await supabase
    .from("tours")
    .select("id,tour_no,name")
    .eq("stage_id", sid)
    .order("tour_no", { ascending: true });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href={`/admin/stages/${sid}`}>← К этапу</Link>
      </p>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>
        Редактировать матч #{match.id}
      </h1>

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        {teamNameRel(match.home_team)} — {teamNameRel(match.away_team)}
      </p>

      <div style={{ marginTop: 20 }}>
        <EditMatchForm
          stageId={sid}
          tourId={tid}
          matchId={mid}
          teams={(teams ?? []) as Array<{ id: number; name: string }>}
          tours={(tours ?? []) as Array<{ id: number; tour_no: number; name: string | null }>}
          initialTourId={Number(match.tour_id)}
          initialStageMatchNo={match.stage_match_no ?? null}
          initialKickoffAt={match.kickoff_at ?? ""}
          initialDeadlineAt={match.deadline_at ?? ""}
          initialStatus={match.status ?? "draft"}
          initialHomeTeamId={Number((match as any).home_team_id)}
          initialAwayTeamId={Number((match as any).away_team_id)}
        />
      </div>
    </main>
  );
}