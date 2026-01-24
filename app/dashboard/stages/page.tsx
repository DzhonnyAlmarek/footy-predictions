import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function UserStagesPage() {
  const supabase = await createClient();

  // DashboardLayout уже гарантирует: залогинен, не admin, пароль сменён

  const { data: stages, error } = await supabase
    .from("stages")
    .select("id,name,status,created_at,matches_required")
    .eq("status", "published")
    .order("id", { ascending: false });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Этапы</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Выберите этап → тур → матчи
          </p>
        </div>
        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/dashboard">Мои прогнозы</Link>
          <Link href="/leaderboard">Лидерборд</Link>
        </nav>
      </header>

      {error && (
        <p style={{ marginTop: 16, color: "crimson" }}>Ошибка: {error.message}</p>
      )}

      <section style={{ marginTop: 24 }}>
        {!stages || stages.length === 0 ? (
          <p>Пока нет опубликованных этапов.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {stages.map((s: any) => (
              <Link
                key={s.id}
                href={`/dashboard/stages/${s.id}/tours`}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  padding: 14,
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {s.name}
                </div>
                <div style={{ marginTop: 6, opacity: 0.8 }}>
                  этап #{s.id} • матчей: {s.matches_required} • опубликован:{" "}
                  {new Date(s.created_at).toLocaleString("ru-RU", { dateStyle: "medium" })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
