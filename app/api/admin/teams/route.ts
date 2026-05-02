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

export async function POST(req: Request) {
  try {
    const cs = await cookies();
    const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();

    if (login !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ ok: false, error: "team_name_required" }, { status: 400 });
    }

    const sb = service();

    const { data, error } = await sb
      .from("teams")
      .insert({ name })
      .select("id,name")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "insert_failed", message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, team: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "create team failed" },
      { status: 500 }
    );
  }
}