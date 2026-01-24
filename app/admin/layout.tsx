import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/app/_components/back-button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: acc } = await supabase
    .from("login_accounts")
    .select("must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();

  if (acc?.must_change_password) redirect("/change-password");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Ошибка</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>{profErr.message}</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/logout">Выйти</Link>
        </p>
      </main>
    );
  }

  if (profile?.role !== "admin") {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>403 • Доступ запрещён</h1>
        <p style={{ marginTop: 10, opacity: 0.85 }}>Эта зона только для админа.</p>
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/dashboard" style={{ textDecoration: "underline" }}>
            Перейти в кабинет пользователя
          </Link>
          <Link href="/logout" style={{ textDecoration: "underline" }}>
            Выйти
          </Link>
        </div>
      </main>
    );
  }

  const loginLabel = profile?.username ? `Выйти (${profile.username})` : "Выйти";

  return (
    <div>
      <div style={{ borderBottom: "1px solid #eee", padding: "12px 24px" }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <BackButton />
            <Link href="/admin" style={{ textDecoration: "underline" }}>
              Домой
            </Link>
          </div>

          {/* ЕДИНСТВЕННОЕ МЕНЮ */}
          <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/admin/current-table">Текущая таблица</Link>
            <Link href="/admin/stages">Этапы</Link>
            <Link href="/admin/results">Результаты</Link>
            <Link href="/admin/audit">Логи</Link>
            <Link href="/rating">Рейтинг</Link>
            <Link href="/logout">{loginLabel}</Link>
          </nav>
        </div>
      </div>

      {children}
    </div>
  );
}
