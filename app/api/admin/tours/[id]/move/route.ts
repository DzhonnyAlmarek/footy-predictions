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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tourId = Number(id);
    const body = await req.json().catch(() => ({}));
    const targetStageId = Number(body?.target_stage_id);
    const renumber = body?.renumber !== false;

    if (!Number.isFinite(tourId)) {
      return NextResponse.json(
        { ok: false, error: "Некорректный tour id" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(targetStageId)) {
      return NextResponse.json(
        { ok: false, error: "Некорректный target stage id" },
        { status: 400 }
      );
    }

    const sb = service();

    const { data, error } = await sb.rpc("move_tour_to_stage", {
      p_tour_id: tourId,
      p_target_stage_id: targetStageId,
      p_renumber: renumber,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "move tour failed" },
      { status: 500 }
    );
  }
}