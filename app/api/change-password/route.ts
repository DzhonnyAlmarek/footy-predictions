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

function b64urlEncodeUtf8(s: string): string {
  // utf8 -> base64 -> base64url
  const b64 = Buffer.from(s, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
    const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();

    if (!fpLogin) {
      return NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const newPass = String(body.new_password ?? body.newPassword ?? body.password ?? "").trim();

    if (!newPass || newPass.length < 5) {
      return NextResponse.json({ ok: false, error: "bad_password" }, { status: 400 });
    }

    const sb = service();

    const { data: acc, error: accErr } = await sb
      .from("login_accounts")
      .select("user_id,login")
      .eq("login", fpLogin)
      .maybeSingle();

    if (accErr) {
      return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    }
    if (!acc?.user_id) {
      return NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 });
    }

    const { error: updErr } = await sb.auth.admin.updateUserById(acc.user_id, {
      password: newPass,
    });

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    const { error: flagErr } = await sb
      .from("login_accounts")
      .update({ must_change_password: false, temp_password: null })
      .eq("login", fpLogin);

    const redirect = "/";

    const res = NextResponse.json(
      flagErr ? { ok: true, warn: "flags_not_updated", redirect } : { ok: true, redirect },
      { status: 200 }
    );

    // flash: сообщение
    res.cookies.set("fp_flash", "pwd_changed", {
      path: "/",
      maxAge: 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });

    // ✅ flash: выбранный логин в ASCII (base64url)
    res.cookies.set("fp_flash_login_b64", b64urlEncodeUtf8(fpLogin), {
      path: "/",
      maxAge: 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
