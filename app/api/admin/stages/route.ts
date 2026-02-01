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

// ✅ Next 15: cookies() типизируется как Promise в некоторых окружениях → await
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
        // для нашей проверки роли писать cookies не нужно
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

  // роль проверяем через service role (обходит RLS на profiles)
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

/* ================== POST: create stage ================== */

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const matchesRequired = body.matches_required === undefined ? 56 : Number(body.matches_required);

  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!Number.isFinite(matchesRequired) || matchesRequired <= 0) {
    return NextResponse.json({ error: "matches_required_invalid" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  const { data, error } = await svc
    .from("stages")
    .insert({
      name,
      status: "draft", // можно оставлять в БД, в UI мы не показываем
      is_current: false,
      matches_required: matchesRequired,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: data.id });
}

/* ================== PATCH: update OR set current ================== */

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const stageId = Number(body.stage_id);

  if (!Number.isFinite(stageId)) {
    return NextResponse.json({ error: "stage_id_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // ✅ поставить текущим
  if (body.set_current === true) {
    const { error: e1 } = await svc.from("stages").update({ is_current: false }).neq("id", -1);
    if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

    const { error: e2 } = await svc.from("stages").update({ is_current: true }).eq("id", stageId);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  }

  // ✅ редактирование (в UI: name + matches_required)
  const patch: any = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name_empty" }, { status: 400 });
    patch.name = name;
  }

  if (body.matches_required !== undefined) {
    const mr = Number(body.matches_required);
    if (!Number.isFinite(mr) || mr <= 0) {
      return NextResponse.json({ error: "matches_required_invalid" }, { status: 400 });
    }
    patch.matches_required = mr;
  }

  // статус можно менять в БД через API, но UI его не использует
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!["draft", "published", "locked"].includes(s)) {
      return NextResponse.json({ error: "status_invalid" }, { status: 400 });
    }
    patch.status = s;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await svc.from("stages").update(patch).eq("id", stageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

/* ================== DELETE: delete stage ================== */

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const stageId = Number(body.stage_id);

  if (!Number.isFinite(stageId)) {
    return NextResponse.json({ error: "stage_id_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // безопасное удаление (если cascade не настроен)
  await svc.from("matches").delete().eq("stage_id", stageId);
  await svc.from("tours").delete().eq("stage_id", stageId);

  const { error } = await svc.from("stages").delete().eq("id", stageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
