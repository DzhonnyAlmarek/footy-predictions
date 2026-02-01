export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminAuditPage() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900 }}>Audit</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>{profErr.message}</p>
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

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div className="card">
        <div className="cardHeader">
          <div className="cardTitle">Audit</div>
          <div className="cardSub" style={{ opacity: 0.8 }}>
            Журнал действий администратора (страница динамическая, build не пререндерит).
          </div>
        </div>

        <div className="cardBody">
          <div className="cardSoft" style={{ opacity: 0.85 }}>
            Если у тебя уже есть таблица аудита (например <b>audit_log</b>), скажи её имя — подключу вывод событий.
          </div>

          <div style={{ marginTop: 16, opacity: 0.75 }}>
            <Link href="/admin" style={{ textDecoration: "underline" }}>
              Назад в админку
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
