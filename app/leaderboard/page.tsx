import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_leaderboard", { p_limit: 50 });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Лидерборд</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>Сумма очков по всем начисленным матчам</p>
        </div>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/">Матчи</Link>
          <Link href="/dashboard">Мои прогнозы</Link>
          <Link href="/admin/results">Админ</Link>
        </nav>
      </header>

      {error && (
        <p style={{ marginTop: 16, color: "crimson" }}>
          Ошибка: {error.message}
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        {!data || data.length === 0 ? (
          <p>Пока нет данных. Начислите очки хотя бы по одному матчу.</p>
        ) : (
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 140px 120px",
                gap: 0,
                padding: "10px 14px",
                background: "#f7f7f7",
                fontWeight: 800,
              }}
            >
              <div>#</div>
              <div>Пользователь</div>
              <div style={{ textAlign: "right" }}>Очки</div>
              <div style={{ textAlign: "right" }}>Проводки</div>
            </div>

            {data.map((row: any, idx: number) => (
              <div
                key={row.user_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 140px 120px",
                  padding: "10px 14px",
                  borderTop: "1px solid #eee",
                }}
              >
                <div>{idx + 1}</div>
                <div>{row.username}</div>
                <div style={{ textAlign: "right", fontWeight: 800 }}>{row.total_points}</div>
                <div style={{ textAlign: "right", opacity: 0.8 }}>{row.entries}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
