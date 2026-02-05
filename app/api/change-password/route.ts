import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

type Body = {
  new_password?: string;
  newPassword?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const cs = await cookies();

    const rawLogin = cs.get("fp_login")?.value ?? "";
    const rawAuth = cs.get("fp_auth")?.value ?? "";

    const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
    const hasFpAuth = !!rawAuth;

    if (!fpLogin) {
      return NextResponse.json(
        {
          ok: false,
          error: "not_auth",
          where: "cookies",
          hasFpAuth,
          rawLogin,
          fpLogin,
        },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const newPass = String(body.new_password ?? body.newPassword ?? body.password ?? "").trim();

    if (!newPass || newPass.length < 5) {
      return NextResponse.json(
        { ok: false, error: "bad_password", minLen: 5 },
        { status: 400 }
      );
    }

    const sb = service();

    const { data: acc, error: accErr } = await sb
      .from("login_accounts")
      .select("user_id,login,must_change_password")
      .eq("login", fpLogin)
      .maybeSingle();

    if (accErr) {
      return NextResponse.json(
        { ok: false, error: accErr.message, where: "login_accounts_select", fpLogin },
        { status: 500 }
      );
    }

    if (!acc?.user_id) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "no_user_id", fpLogin },
        { status: 401 }
      );
    }

    const { error: updErr } = await sb.auth.admin.updateUserById(acc.user_id, {
      password: newPass,
    });

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: updErr.message, where: "auth_admin_update" },
        { status: 500 }
      );
    }

    const { error: flagErr } = await sb
      .from("login_accounts")
      .update({ must_change_password: false, temp_password: null })
      .eq("login", fpLogin);

    if (flagErr) {
      // пароль уже изменён — флаги не критично
      return NextResponse.json(
        { ok: true, warn: "flags_not_updated", details: flagErr.message, redirect: "/dashboard" },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, redirect: "/dashboard" });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error", where: "catch" },
      { status: 500 }
    );
  }
}
