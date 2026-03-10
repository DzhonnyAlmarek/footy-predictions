import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string) {
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

  if (!Number.isFinite(sid) || !Number.isFinite(tid) || !Number.isFinite(mid)) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "crimson" }}>Некорректный путь редактирования матча.</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/admin/stages">← К этапам</Link>
        </p>
      </main>
    );
  }

  const supabase = service();

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("id", sid)
    .maybeSingle();

  const { data: tour } = await supabase
    .from("tours")
    .select("id,stage_id,tour_no,name")
    .eq("id", tid)
    .maybeSingle();

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
    .maybeSingle();

  if (!stage || !tour) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "crimson" }}>Этап или тур не найдены.</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/admin/stages">← К этапам</Link>
        </p>
      </main>
    );
  }

  if (error || !match) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "crimson" }}>
          Матч не найден{error ? `: ${error.message}` : ""}
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/admin/stages/${sid}/tours/${tid}/matches`}>← Назад к матчам тура</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href={`/admin/stages/${sid}/tours/${tid}/matches`}>← Назад к матчам тура</Link>
      </p>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 12 }}>
        Матч #{match.id}
      </h1>

      <p style={{ marginTop: 8 }}>
        Этап: <b>{stage.name}</b>
      </p>

      <p style={{ marginTop: 8 }}>
        Тур: <b>{tour.tour_no}{tour.name ? ` — ${tour.name}` : ""}</b>
      </p>

      <p style={{ marginTop: 8 }}>
        Команды: <b>{teamNameRel(match.home_team)} — {teamNameRel(match.away_team)}</b>
      </p>

      <pre
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fafafa",
          overflowX: "auto",
          fontSize: 13,
        }}
      >
        {JSON.stringify(match, null, 2)}
      </pre>
    </main>
  );
}