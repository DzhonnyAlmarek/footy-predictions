import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function serviceAnon() {
  // Для чтения логинов достаточно anon (если RLS разрешает),
  // но если RLS запрещает — переключишь на service ниже.
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function serviceRole() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  try {
    // 1) пробуем anon
    let sb = serviceAnon();
    let { data, error } = await sb
      .from("login_accounts")
      .select("login,must_change_password,temp_password")
      .order("login", { ascending: true });

    // 2) если RLS не пустила — пробуем service-role
    if (error) {
      sb = serviceRole();
      const r2 = await sb
        .from("login_accounts")
        .select("login,must_change_password,temp_password")
        .order("login", { ascending: true });
      data = r2.data;
      error = r2.error;
    }

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      logins: (data ?? []).map((x: any) => ({
        login: x.login,
        must_change_password: !!x.must_change_password,
        temp_password: x.temp_password ?? null,
      })),
    });
  } catch (e: any) {
    // Это как раз выведет Missing env или fetch failed
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
