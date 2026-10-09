"use client";

import { useEffect, useState } from "react";

type Match = {
  id: string | number;
  kickoff_at: string | null;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  stage_name: string | null;
  tour_name: string | null;
};
export default function TestMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState("Загружаем тестовые матчи…");

  useEffect(() => {
    let active = true;
    fetch("/api/test/matches", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      })
      .then((result) => {
        if (!active) return;
        if (!result.ok || !Array.isArray(result.matches)) throw new Error("invalid");
        setMatches(result.matches);
        setMessage(result.matches.length ? "" : "Тестовых матчей пока нет");
      })
      .catch(() => { if (active) setMessage("Не удалось получить матчи из тестовой базы"); });
    return () => { active = false; };
  }, []);

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Тестовые матчи — Neon</h1>
      <p>Отдельная тестовая база. Реальные прогнозы и результаты конкурса здесь не отображаются.</p>
      {message && <p role="status">{message}</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {matches.map((match) => (
          <article key={String(match.id)} style={{ padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
            <div>{match.stage_name || "Тестовый этап"} · {match.tour_name || "Тестовый тур"}</div>
            <h2 style={{ fontSize: 19 }}>{match.home_team || "Хозяева"} — {match.away_team || "Гости"}</h2>
            <p>{match.home_score == null || match.away_score == null ? "Матч без результата" : `${match.home_score} : ${match.away_score}`}</p>
            <small>{match.kickoff_at ? new Date(match.kickoff_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " (МСК)" : "Дата не назначена"}</small>
          </article>
        ))}
      </div>
    </main>
  );
}
