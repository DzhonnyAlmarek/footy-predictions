import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getServiceSupabase() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// ✅ Next 15: cookies() может быть Promise-типом → используем await
async function getAuthedSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

async function requireAdmin() {
  const authed = await getAuthedSupabase();
  const { data: u } = await authed.auth.getUser();

  if (!u?.user) {
    return { ok: false as const, res: NextResponse.json({ error: "not_auth" }, { status: 401 }) };
  }

  const svc = getServiceSupabase();
  const { data: profile, error } = await svc
    .from("profiles")
    .select("role")
    .eq("id", u.user.id)
    .maybeSingle();

  if (error) {
    return { ok: false as const, res: NextResponse.json({ error: error.message }, { status: 400 }) };
  }

  if (profile?.role !== "admin") {
    return { ok: false as const, res: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  }

  return { ok: true as const };
}

function dateToKickoffIso(dateStr: string) {
  return new Date(`${dateStr}T12:00:00.000Z`).toISOString();
}

/* ================== POST ================== */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));

  const stageId = Number(body.stage_id);
  const tourId = Number(body.tour_id);
  const homeTeamId = Number(body.home_team_id);
  const awayTeamId = Number(body.away_team_id);
  const date = body.date ? String(body.date).trim() : "";

  if (!Number.isFinite(stageId)) return NextResponse.json({ error: "stage_id_required" }, { status: 400 });
  if (!Number.isFinite(tourId)) return NextResponse.json({ error: "tour_id_required" }, { status: 400 });
  if (!Number.isFinite(homeTeamId)) return NextResponse.json({ error: "home_team_id_required" }, { status: 400 });
  if (!Number.isFinite(awayTeamId)) return NextResponse.json({ error: "away_team_id_required" }, { status: 400 });
  if (homeTeamId === awayTeamId) return NextResponse.json({ error: "same_teams" }, { status: 400 });

  const svc = getServiceSupabase();

  const { data: last, error: lastErr } = await svc
    .from("matches")
    .select("stage_match_no")
    .eq("stage_id", stageId)
    .order("stage_match_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) return NextResponse.json({ error: lastErr.message }, { status: 400 });

  const stageMatchNo = Number(last?.stage_match_no ?? 0) + 1;

  const placeholder = "2099-01-01T12:00:00.000Z";
  const kickoff = date ? dateToKickoffIso(date) : placeholder;
  const deadline = date ? new Date(`${date}T00:00:00.000Z`).toISOString() : placeholder;

  const { data, error } = await svc
    .from("matches")
    .insert({
      stage_id: stageId,
      tour_id: tourId,
      stage_match_no: stageMatchNo,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_at: kickoff,
      deadline_at: deadline,
      status: "scheduled",
      home_score: null,
      away_score: null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: data.id, stage_match_no: stageMatchNo });
}

/* ================== PATCH ================== */
export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const matchId = Number(body.match_id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "match_id_required" }, { status: 400 });
  }

  const patch: any = {};

  if (body.date !== undefined) {
    const date = String(body.date ?? "").trim();
    if (date) {
      patch.kickoff_at = dateToKickoffIso(date);
      patch.deadline_at = new Date(`${date}T00:00:00.000Z`).toISOString();
    } else {
      const placeholder = "2099-01-01T12:00:00.000Z";
      patch.kickoff_at = placeholder;
      patch.deadline_at = placeholder;
    }
  }

  if (body.home_score !== undefined) patch.home_score = body.home_score === "" ? null : Number(body.home_score);
  if (body.away_score !== undefined) patch.away_score = body.away_score === "" ? null : Number(body.away_score);

  if (body.home_team_id !== undefined) patch.home_team_id = Number(body.home_team_id);
  if (body.away_team_id !== undefined) patch.away_team_id = Number(body.away_team_id);

  if (
    patch.home_team_id !== undefined &&
    patch.away_team_id !== undefined &&
    Number.isFinite(patch.home_team_id) &&
    Number.isFinite(patch.away_team_id) &&
    patch.home_team_id === patch.away_team_id
  ) {
    return NextResponse.json({ error: "same_teams" }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const svc = getServiceSupabase();
  const { error } = await svc.from("matches").update(patch).eq("id", matchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

/* ================== DELETE ================== */
export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const matchId = Number(body.match_id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "match_id_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();
  const { error } = await svc.from("matches").delete().eq("id", matchId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
