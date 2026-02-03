import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET — получить прогнозы
export async function GET() {
  try {
    const { supabase, applyCookies } = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("predictions")
      .select("*");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ ok: true, data });
    applyCookies(res);
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}

// POST — сохранить / обновить прогноз
export async function POST(req: Request) {
  try {
    const { supabase, applyCookies } = await createSupabaseServerClient();

    // ✅ проверяем сессию через cookies
    const { data: s } = await supabase.auth.getSession();
    const user = s?.session?.user;

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "not_auth" },
        { status: 401 }
      );
    }

    const payload = await req.json();

    const { error } = await supabase
      .from("predictions")
      .upsert(payload);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ ok: true });
    applyCookies(res);
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
