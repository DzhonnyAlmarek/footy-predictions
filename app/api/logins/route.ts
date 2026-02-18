import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  try {
    const sb = service();

    const { data, error } = await sb
      .from("login_accounts")
      .select("login,must_change_password,temp_password")
      .order("login", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, where: "select login_accounts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      logins: (data ?? []).map((x) => ({
        login: x.login,
        must_change_password: !!x.must_change_password,
        temp_password: x.temp_password ?? null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error", where: "try/catch" },
      { status: 500 }
    );
  }
}
