import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const login = String(body?.login ?? "").trim();
    const password = String(body?.password ?? "");

    if (!login || !password) {
      return NextResponse.json({ error: "login_and_password_required" }, { status: 400 });
    }

    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anon = mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const cookieStore = await cookies();

    // ✅ создадим “временный” response, но финальный сформируем после redirect
    // cookies будем ставить в response, который вернём в конце
    let responseToSetCookiesOn: NextResponse | null = null;

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          if (!responseToSetCookiesOn) return; // пока не создали — просто пропустим
          cookiesToSet.forEach(({ name, value, options }) => {
            responseToSetCookiesOn!.cookies.set(name, value, {
              ...(options ?? {}),
              path: "/", // ✅ критично
            });
          });
        },
      },
    });

    // 1) user_id по login
    const { data: acc, error: accErr } = await supabase
      .from("login_accounts")
      .select("user_id")
      .eq("login", login)
      .single();

    if (accErr || !acc?.user_id) {
      return NextResponse.json({ error: "unknown_login" }, { status: 401 });
    }

    // 2) тех. email по user_id через service_role
    const admin = createAdminClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(acc.user_id);
    if (userErr || !userRes?.user?.email) {
      return NextResponse.json({ error: "auth_user_not_found" }, { status: 401 });
    }

    // 3) sign in — для корректной записи cookies нужен уже готовый response
    // поэтому сначала определим redirect по данным (до signIn мы не можем)
    // Но redirect зависит от must_change_password и роли → их можно читать и без signIn через service role:
    const { data: acc2 } = await admin
      .from("login_accounts")
      .select("must_change_password")
      .eq("user_id", acc.user_id)
      .maybeSingle();

    let redirectTo = "/dashboard";
    if (acc2?.must_change_password) {
      redirectTo = "/change-password";
    } else {
      const { data: prof } = await admin
        .from("profiles")
        .select("role")
        .eq("id", acc.user_id)
        .maybeSingle();
      if (prof?.role === "admin") redirectTo = "/admin";
    }

    // ✅ теперь создаём финальный response
    const res = NextResponse.json({ ok: true, redirect: redirectTo });
    responseToSetCookiesOn = res;

    // ✅ и только теперь делаем signIn, чтобы supabase cookies записались в res
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: userRes.user.email,
      password,
    });

    if (signInErr) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "bad_request" }, { status: 400 });
  }
}
