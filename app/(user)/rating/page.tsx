import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function RatingPage() {
  const supabase = await createClient();

  // Берём участников из login_accounts (кроме ADMIN)
  const { data: accounts, error: aErr } = await supabase
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login", { ascending: true });

  const userIds = (accounts ?? []).map((a: any) => a.user_id);

  // Суммируем очки по points_ledger
  let pointsMap = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: rows, error: pErr } = await supabase
      .from("points_ledger")
      .select("user_id, points")
      .in("user_id", userIds);

    if (!pErr) {
      for (const r of rows ?? []) {
        pointsMap.set(r.user_id, (pointsMap.get(r.user_id) ?? 0) + (r.points ?? 0));
      }
    }
  }

  const rating =
    (accounts ?? []).map((a: any) => ({
      login: a.login,
      points: pointsMap.get(a.user_id) ?? 0,
    }))
    .sort((x, y) => y.points - x.points || x.login.localeCompare(y.login, "ru"));

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Рейтинг</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>Только участники прогнозов (без ADMIN)</p>
        </div>
        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/">Авторизация</Link>
          <Link href="/dashboard/stages">Этапы</Link>
          <Link href="/admin">Админ</Link>
        </nav>
      </header>

      {(aErr) && (
        <p style={{ marginTop: 16, color: "crimson" }}>
          Ошибка: {aErr.message}
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        {rating.length === 0 ? (
          <p>Пока нет участников.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rating.map((r, idx) => (
              <div
                key={r.login}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {idx + 1}. {r.login}
                </div>
                <div style={{ fontWeight: 900 }}>{r.points}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
