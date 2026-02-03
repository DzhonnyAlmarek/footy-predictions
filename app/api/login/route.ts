import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginBody = {
  login?: string;
  password?: string;
};

// Технические email (как в scripts/seed-logins.mjs / fix-*.mjs)
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

    const { supabase, res } = await createSupabaseServerClient();

    // 1️⃣ Проверяем, что логин существует
    const { data: acc, error: accErr } = await supabase
      .from("login_accounts")
      .select("login,must_change_password")
      .eq("login", login)
      .maybeSingle();

    if (accErr) {
      return NextResponse.json(
        { ok: false, error: accErr.message },
        { status: 500 }
      );
    }

    if (!acc) {
      return NextResponse.json(
        { ok: false, error: "unknown_login" },
        { status: 401 }
      );
    }

    // 2️⃣ Получаем технический email
    const email = techEmail(login);
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "unknown_login" },
        { status: 401 }
      );
    }

    // 3️⃣ Авторизация через Supabase Auth
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authErr) {
      return NextResponse.json(
        { ok: false, error: "wrong_password" },
        { status: 401 }
      );
    }

    // 4️⃣ Куда редиректить
    const redirect = acc.must_change_password
      ? "/change-password"
      : login === "ADMIN"
        ? "/admin"
        : "/dashboard";

    const jsonRes = NextResponse.json({ ok: true, redirect });

    // 5️⃣ Прокидываем Supabase cookies
    res.cookies.getAll().forEach((c) => {
      jsonRes.cookies.set(c.name, c.value, { path: "/" });
    });

    // 6️⃣ fp_auth (его проверяет middleware.ts)
    jsonRes.cookies.set("fp_auth", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return jsonRes;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
