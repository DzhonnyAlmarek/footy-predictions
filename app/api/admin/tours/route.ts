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
  const supabase = await getAuthedSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { ok: false, res: NextResponse.json({ error: "not_auth" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "admin") {
    return { ok: false, res: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  }

  return { ok: true };
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const stageId = Number(body.stage_id);
  const tourNo = Number(body.tour_no);
  const name = body.name === undefined ? null : String(body.name ?? "").trim() || null;

  if (!Number.isFinite(stageId)) return NextResponse.json({ error: "stage_id_required" }, { status: 400 });
  if (!Number.isFinite(tourNo)) return NextResponse.json({ error: "tour_no_required" }, { status: 400 });

  const svc = getServiceSupabase();

  const { data, error } = await svc
    .from("tours")
    .insert({ stage_id: stageId, tour_no: tourNo, name })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
