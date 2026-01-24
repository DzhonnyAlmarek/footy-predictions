import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ChangePasswordForm from "./password-form";

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  // если не залогинен — на главную
  if (!user) redirect("/");

  // достаём логин (КТО сейчас)
  const { data: acc } = await supabase
    .from("login_accounts")
    .select("login, must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();

  // если флаг уже снят — не держим человека тут, отправляем внутрь
  if (acc && acc.must_change_password === false) {
    // по роли отправим на нужную зону
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "admin") redirect("/admin");
    redirect("/dashboard");
  }

  const loginName = acc?.login ?? user.email ?? "пользователь";

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Смена пароля</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Вы вошли как: <b>{loginName}</b>
          </p>
        </div>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/logout">Выйти</Link>
        </nav>
      </header>

      <section style={{ marginTop: 16 }}>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
