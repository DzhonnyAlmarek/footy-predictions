import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type CreateBody = {
  stage_id?: number;
  tour_id?: number;
  home_team_id?: number;
  away_team_id?: number;
  kickoff_at?: string | null;
  deadline_at?: string | null;
};

export async function POST(req: Request) {
  const cs = await cookies();
  const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (login !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const stage_id = Number(body.stage_id);
  const tour_id = Number(body.tour_id);
  const home_team_id = Number(body.home_team_id);
  const away_team_id = Number(body.away_team_id);

  if (!stage_id) return NextResponse.json({ ok: false, error: "bad_stage_id" }, { status: 400 });
  if (!tour_id) return NextResponse.json({ ok: false, error: "bad_tour_id" }, { status: 400 });
  if (!home_team_id) return NextResponse.json({ ok: false, error: "bad_home_team_id" }, { status: 400 });
  if (!away_team_id) return NextResponse.json({ ok: false, error: "bad_away_team_id" }, { status: 400 });
  if (home_team_id === away_team_id) {
    return NextResponse.json({ ok: false, error: "teams_must_differ" }, { status: 400 });
  }

  const kickoff_at = body.kickoff_at ?? null;
  const deadline_at = body.deadline_at ?? null;

  try {
    const sb = service();

    // 1) Проверим, что тур принадлежит этапу (чтобы не ловить "тихие" триггеры)
    const { data: tour, error: tourErr } = await sb
      .from("tours")
      .select("id,stage_id")
      .eq("id", tour_id)
      .maybeSingle();

    if (tourErr) {
      return NextResponse.json(
        { ok: false, error: "tour_check_failed", message: tourErr.message },
        { status: 500 }
      );
    }

    if (!tour) {
      return NextResponse.json({ ok: false, error: "tour_not_found" }, { status: 404 });
    }

    if (Number(tour.stage_id) !== stage_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "tour_stage_mismatch",
          message: `Tour ${tour_id} belongs to stage ${tour.stage_id}, but request stage_id=${stage_id}`,
        },
        { status: 409 }
      );
    }

    // 2) Вставка матча (service role)
    const { data: inserted, error: insErr } = await sb
      .from("matches")
      .insert({
        stage_id,
        tour_id,
        home_team_id,
        away_team_id,
        kickoff_at,
        deadline_at,
        status: "scheduled",
      })
      .select("id,stage_match_no")
      .maybeSingle();

    if (insErr) {
      // Тут чаще всего прилетает:
      // - stage locked (trigger block_match_write_when_stage_locked)
      // - prevent_team_duplicate_in_tour
      // - enforce_match_stage
      return NextResponse.json(
        { ok: false, error: "insert_failed", message: insErr.message, details: insErr.details },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      matchId: inserted?.id ?? null,
      stage_match_no: inserted?.stage_match_no ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}