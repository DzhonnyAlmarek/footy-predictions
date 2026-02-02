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
    const body = await req.json().catch(() => ({}));

    const login = String(body?.login ?? "").trim();
    const password = String(body?.password ?? "");

    if (!login || !password) {
      return NextResponse.json({ error: "login_and_password_required" }, { status: 400 });
    }

    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anon = mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const cookieStore = await cookies();

    const admin = createAdminClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: acc, error: accErr } = await admin
      .from("login_accounts")
      .select("user_id, must_change_password")
      .eq("login", login)
      .maybeSingle();

    if (accErr || !acc?.user_id) {
      return NextResponse.json({ error: "unknown_login" }, { status: 401 });
    }

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(acc.user_id);
    if (userErr || !userRes?.user?.email) {
      return NextResponse.json({ error: "auth_user_not_found" }, { status: 401 });
    }

    let redirectTo = "/dashboard";
    if (acc.must_change_password) {
      redirectTo = "/change-password";
    } else {
      const { data: prof } = await admin
        .from("profiles")
        .select("role")
        .eq("id", acc.user_id)
        .maybeSingle();
      if (prof?.role === "admin") redirectTo = "/admin";
    }

    // ✅ один финальный response
    const res = NextResponse.json({ ok: true, redirect: redirectTo });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, {
              ...(options ?? {}),
              path: "/",
              // ✅ страхуем атрибуты на Vercel
              httpOnly: options?.httpOnly ?? true,
              sameSite: (options?.sameSite as any) ?? "lax",
              secure: options?.secure ?? true,
            });
          });
        },
      },
    });

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: userRes.user.email,
      password,
    });

    if (signInErr) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }

    // ✅ маркер для твоей логики защиты (если нужен)
    res.cookies.set("fp_auth", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "bad_request" }, { status: 400 });
  }
}
