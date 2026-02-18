import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ================= utils ================= */

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

/* ================= route ================= */

// ВАЖНО:
// - Это endpoint для страницы авторизации (до логина),
//   поэтому anon-клиент упирается в RLS.
// - Используем service role, но отдаём ТОЛЬКО безопасные поля.
// - temp_password НЕ отдаём никогда.
export async function GET() {
  try {
    const sb = service();

    const { data, error } = await sb
      .from("login_accounts")
      .select("login,must_change_password")
      .order("login", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const res = NextResponse.json({
      ok: true,
      logins: (data ?? []).map((x: any) => ({
        login: String(x.login ?? ""),
        must_change_password: !!x.must_change_password,
      })),
    });

    // чтобы Vercel/Next не кэшировали список логинов
    res.headers.set("Cache-Control", "no-store, max-age=0");
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
