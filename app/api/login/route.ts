import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginBody = {
  login?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LoginBody;

    const login = (body.login ?? "").trim();
    const password = (body.password ?? "").trim();

    if (!login || !password) {
      return NextResponse.json(
        { ok: false, error: "login and password required" },
        { status: 400 }
      );
    }

    const { supabase, res } = await createSupabaseServerClient();

    // 1️⃣ находим email по login
    const { data: acc, error: accErr } = await supabase
      .from("login_accounts")
      .select("email")
      .eq("login", login)
      .maybeSingle();

    if (accErr) {
      return NextResponse.json(
        { ok: false, error: accErr.message },
        { status: 500 }
      );
    }

    if (!acc?.email) {
      return NextResponse.json(
        { ok: false, error: "user not found" },
        { status: 401 }
      );
    }

    // 2️⃣ логинимся через Supabase Auth
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password,
    });

    if (authErr) {
      return NextResponse.json(
        { ok: false, error: authErr.message },
        { status: 401 }
      );
    }

    // 3️⃣ ответ + cookies
    const jsonRes = NextResponse.json({ ok: true });

    res.cookies.getAll().forEach((c) => {
      jsonRes.cookies.set(c.name, c.value, { path: "/" });
    });

    return jsonRes;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
