import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "not_auth" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");

  if (password.length < 6) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  const upd = await supabase.auth.updateUser({ password });
  if (upd.error) {
    return NextResponse.json({ error: upd.error.message }, { status: 400 });
  }

  // ✅ фиксируем, что пароль сменили, и удаляем временный
  const { error } = await supabase
    .from("login_accounts")
    .update({ must_change_password: false, temp_password: null })
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
