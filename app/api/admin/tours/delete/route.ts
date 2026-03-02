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
  const cascadeMatches = Boolean(body?.cascadeMatches ?? true); // по умолчанию — да

  if (!tourId) return NextResponse.json({ ok: false, error: "bad_tourId" }, { status: 400 });

  const sb = service();

  if (cascadeMatches) {
    const { error: mErr } = await sb.from("matches").delete().eq("tour_id", tourId);
    if (mErr) {
      return NextResponse.json(
        { ok: false, error: "delete_matches_failed", message: mErr.message },
        { status: 500 }
      );
    }
  } else {
    const { count, error: cntErr } = await sb
      .from("matches")
      .select("id", { head: true, count: "exact" })
      .eq("tour_id", tourId);

    if (cntErr) {
      return NextResponse.json({ ok: false, error: "check_failed", message: cntErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: false, error: "tour_has_matches", matchesCount: count }, { status: 409 });
    }
  }

  const { error: delErr } = await sb.from("tours").delete().eq("id", tourId);
  if (delErr) {
    return NextResponse.json({ ok: false, error: "delete_failed", message: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}