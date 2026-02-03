import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginBody = {
  login?: string;
  password?: string;
};

function techEmail(login: string): string | null {
  const map: Record<string, string> = {
    "СВС": "cvs",
    "АМН": "amn",
    "КДЛ": "kdl",
    "БАА": "baa",
    "КЕН": "ken",
    "ADMIN": "admin",
  };

  const key = login.trim().toUpperCase();
  const slug = map[key];
  if (!slug) return null;
  return `${slug}@local`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as LoginBody;

    const loginRaw = String(body.login ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (!loginRaw || !password) {
      return NextResponse.json(
        { ok: false, error: "login and password required" },
        { status: 400 }
      );
    }

    const login = loginRaw.toUpperCase();

    const { supabase, applyCookies } = await createSupabaseServerClient();

    // Проверяем, что логин существует
    const { data: acc, error: accErr } = await supabase
      .from("login_accounts")
      .select("login,must_change_password")
      .eq("login", login)
      .maybeSingle();

    if (accErr) {
      return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    }
    if (!acc) {
      return NextResponse.json({ ok: false, error: "unknown_login" }, { status: 401 });
    }

    const email = techEmail(login);
    if (!email) {
      return NextResponse.json({ ok: false, error: "unknown_login" }, { status: 401 });
    }

    // Авторизация в Supabase Auth (не делаем её источником истины)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      return NextResponse.json({ ok: false, error: "wrong_password" }, { status: 401 });
    }

    // Дожмём, если Supabase решит выставить cookies (не критично)
    await supabase.auth.getSession();

    const redirectTo = acc.must_change_password
      ? "/change-password"
      : login === "ADMIN"
        ? "/admin"
        : "/dashboard";

    const res = NextResponse.json({ ok: true, redirect: redirectTo });

    // Supabase cookies (не обязательны для нашей логики)
    applyCookies(res);

    // ✅ Долгоживущие cookies для нашей авторизации
    const cookieBase = {
      path: "/",
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,                 // ✅ на Vercel всегда https
      maxAge: 60 * 60 * 24 * 30,    // ✅ 30 дней
    };

    // Маркер входа (можно оставить, но дальше мы на него НЕ опираемся)
    res.cookies.set("fp_auth", "1", cookieBase);

    // ✅ Главная cookie: кто именно вошёл (её мы используем в middleware и API)
    res.cookies.set("fp_login", login, cookieBase);

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
