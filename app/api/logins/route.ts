import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("login_accounts")
    .select("login,must_change_password,temp_password")
    .order("login", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    logins: (data ?? []).map((x) => ({
      login: x.login,
      must_change_password: !!x.must_change_password,
      temp_password: x.temp_password ?? null,
    })),
  });
}
