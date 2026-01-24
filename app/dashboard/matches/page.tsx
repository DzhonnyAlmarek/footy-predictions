import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function UserMatchesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/");

  const { data, error } = await supabase
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      status,
      tournaments ( name, slug ),
      home_team:teams!matches_home_team_id_fkey ( name, slug ),
      away_team:teams!matches_away_team_id_fkey ( name, slug )
    `
    )
    .in("status", ["scheduled", "live"])
    .order("kickoff_at", { ascending: true })
    .limit(50);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Матчи</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>Ближайшие игры</p>
        </div>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/dashboard">Мои прогнозы</Link>
          <Link href="/leaderboard">Лидерборд</Link>
          <a href="/logout">Выйти</a>
        </nav>
      </header>

      {error && (
        <p style={{ marginTop: 16, color: "crimson" }}>Ошибка: {error.message}</p>
      )}

      <section style={{ marginTop: 24 }}>
        {!data || data.length === 0 ? (
          <p>Нет ближайших матчей.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {data.map((m: any) => {
              const kickoff = new Date(m.kickoff_at);
              const deadline = new Date(m.deadline_at);

              return (
                <Link
                  key={m.id}
                  href={`/match/${m.id}`}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 14,
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>
                        {m.home_team?.name ?? "?"} — {m.away_team?.name ?? "?"}
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.8 }}>
                        {m.tournaments?.name ?? "Без турнира"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div>
                        <b>Kickoff:</b>{" "}
                        {kickoff.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <b>Дедлайн:</b>{" "}
                        {deadline.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
