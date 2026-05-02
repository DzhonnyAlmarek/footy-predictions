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
  const cs = await cookies();
  const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();

  if (login !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const tourId = Number(body?.tourId);
  const tourNo = String(body?.tour_no ?? "").trim().toUpperCase();
  const nameRaw = body?.name;

  if (!Number.isFinite(tourId)) {
    return NextResponse.json({ ok: false, error: "bad_tourId" }, { status: 400 });
  }

  if (!tourNo) {
    return NextResponse.json({ ok: false, error: "bad_tour_no" }, { status: 400 });
  }

  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const patch = { tour_no: tourNo, name: name ? name : null };

  const sb = service();
  const { error } = await sb.from("tours").update(patch).eq("id", tourId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "update_failed", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}