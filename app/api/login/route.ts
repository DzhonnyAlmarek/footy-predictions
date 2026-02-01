import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const login = body?.login;
    const password = body?.password;

    if (!login || !password) {
      return NextResponse.json({ error: "login_and_password_required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const cookieStore = await cookies();

    // Server client (anon) with cookies
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // ✅ КРИТИЧНО: всегда ставим path="/", иначе на проде cookie может прилипнуть к /api/login
            cookieStore.set(name, value, {
              ...(options ?? {}),
              path: "/",
              // для *.vercel.app это ок; secure обычно приходит от Supabase, но на всякий можно:
              // secure: true,
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

    // 3) sign in (ставит supabase cookies)
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: userRes.user.email,
      password,
    });

    if (signInErr) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }

    // 4) решаем redirect: смена пароля / admin / user
    const { data: acc2 } = await supabase
      .from("login_accounts")
      .select("must_change_password")
      .eq("user_id", acc.user_id)
      .maybeSingle();

    let redirectTo = "/dashboard";

    if (acc2?.must_change_password) {
      redirectTo = "/change-password";
    } else {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", acc.user_id)
        .maybeSingle();

      if (prof?.role === "admin") redirectTo = "/admin";
    }

    // 5) ответ
    const res = NextResponse.json({ ok: true, redirect: redirectTo });

    // маркер (session cookie)
    res.cookies.set("fp_auth", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true, // ✅ на проде лучше всегда secure
    });

    return res;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
