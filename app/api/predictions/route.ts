import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { supabase, res } = await createSupabaseServerClient();

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

    // если Supabase обновил сессию — прокидываем cookies
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
