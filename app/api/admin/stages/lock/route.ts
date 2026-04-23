import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(req: Request) {
  try {
    const cs = await cookies();
    const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();

    if (fpLogin !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const stageId = Number(body?.stageId);

    if (!Number.isFinite(stageId)) {
      return NextResponse.json({ ok: false, error: "Некорректный stageId" }, { status: 400 });
    }

    const sb = service();

    const { error } = await sb.rpc("lock_stage", {
      p_stage_id: stageId,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "lock stage failed" },
      { status: 500 }
    );
  }
}