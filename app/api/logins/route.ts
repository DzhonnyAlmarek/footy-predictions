import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(url, anon);

  const { data, error } = await supabase
    .from("login_accounts")
    .select("login")
    .order("login", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, logins: [] }, { status: 500 });
  }

  return NextResponse.json({ logins: (data ?? []).map((x) => x.login) });
}
