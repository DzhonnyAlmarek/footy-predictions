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

async function requireAdmin() {
  const cs = await cookies();
  const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();

  if (login !== "ADMIN") {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const slug = String(body?.slug ?? "").trim();

    if (!name) {
      return NextResponse.json({ ok: false, error: "team_name_required" }, { status: 400 });
    }

    if (!slug) {
      return NextResponse.json({ ok: false, error: "team_slug_required" }, { status: 400 });
    }

    const sb = service();

    const { data, error } = await sb
      .from("teams")
      .insert({ name, slug })
      .select("id,name,slug")
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

export async function PATCH(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    const name = String(body?.name ?? "").trim();
    const slug = String(body?.slug ?? "").trim();

    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "team_id_required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ ok: false, error: "team_name_required" }, { status: 400 });
    }

    if (!slug) {
      return NextResponse.json({ ok: false, error: "team_slug_required" }, { status: 400 });
    }

    const sb = service();

    const { data, error } = await sb
      .from("teams")
      .update({ name, slug })
      .eq("id", id)
      .select("id,name,slug")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "update_failed", message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, team: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "update team failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);

    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "team_id_required" }, { status: 400 });
    }

    const sb = service();

    const { error } = await sb.from("teams").delete().eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "delete_failed", message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "delete team failed" },
      { status: 500 }
    );
  }
}