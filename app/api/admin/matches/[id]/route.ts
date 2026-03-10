import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matchId = Number(id);
    if (!Number.isFinite(matchId)) {
      return NextResponse.json({ ok: false, error: "Некорректный id матча" }, { status: 400 });
    }

    const body = await req.json();
    const supabase = service();

    const payload = {
      tour_id: body.tour_id ?? null,
      stage_match_no: body.stage_match_no ?? null,
      kickoff_at: body.kickoff_at ?? null,
      deadline_at: body.deadline_at ?? null,
      status: body.status ?? null,
      home_team_id: body.home_team_id ?? null,
      away_team_id: body.away_team_id ?? null,
    };

    const { data, error } = await supabase
      .from("matches")
      .update(payload)
      .eq("id", matchId)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, match: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "PATCH match failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matchId = Number(id);
    if (!Number.isFinite(matchId)) {
      return NextResponse.json({ ok: false, error: "Некорректный id матча" }, { status: 400 });
    }

    const supabase = service();

    const { error } = await supabase
      .from("matches")
      .delete()
      .eq("id", matchId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "DELETE match failed" },
      { status: 500 }
    );
  }
}