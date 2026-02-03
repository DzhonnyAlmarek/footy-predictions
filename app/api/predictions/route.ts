import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

    const jsonRes = NextResponse.json({ ok: true, data });

    // ✅ важно: если Supabase обновил токены — вернуть cookies клиенту
    applyCookies(jsonRes);

    return jsonRes;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
