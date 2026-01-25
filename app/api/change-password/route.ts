import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getServiceSupabase() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

async function getUserSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // важно: обновление сессии/куков после updateUser
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore in edge cases
          }
        },
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const newPassword = String(body?.newPassword ?? "").trim();

    if (newPassword.length < 5) {
      return NextResponse.json({ error: "Пароль должен быть минимум 5 символов" }, { status: 400 });
    }

    const supabase = await getUserSupabase();

    // 1) должен быть залогинен
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr || !u.user) {
      return NextResponse.json({ error: "Вы не авторизованы" }, { status: 401 });
    }

    const userId = u.user.id;

    // 2) меняем пароль в Supabase Auth (как текущий пользователь)
    const { error: pErr } = await supabase.auth.updateUser({ password: newPassword });
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }

    // 3) снимаем флаг must_change_password через service role (без RLS проблем)
    const svc = getServiceSupabase();

    const { error: aErr } = await svc
      .from("login_accounts")
      .update({ must_change_password: false })
      .eq("user_id", userId);

    if (aErr) {
      return NextResponse.json(
        { error: `Пароль сменён, но не удалось обновить must_change_password: ${aErr.message}` },
        { status: 400 }
      );
    }

    // 4) решаем куда редиректить (admin -> /admin, user -> /dashboard)
    const { data: prof, error: profErr } = await svc
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    const redirect = prof?.role === "admin" ? "/admin" : "/dashboard";

    return NextResponse.json(
      { ok: true, redirect },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
