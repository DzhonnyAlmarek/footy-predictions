"use client";

import { useEffect, useState } from "react";

type Prediction = {
  match_id: string; kickoff_at: string | null; home_team: string | null;
  away_team: string | null; home_pred: number | null; away_pred: number | null;
  home_score: number | null; away_score: number | null;
};

export default function CutoverParticipantPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [message, setMessage] = useState("Проверяем сессию...");
  const [busy, setBusy] = useState(false);

  async function load() {
    const session = await fetch("/api/cutover/session", { cache: "no-store" });
    if (!session.ok) { setAuthenticated(false); setMessage("Войди, чтобы увидеть свои прогнозы."); return; }
    const response = await fetch("/api/cutover/my-predictions", { cache: "no-store" });
    if (!response.ok) { setAuthenticated(false); setMessage("Не удалось получить прогнозы."); return; }
    const data = await response.json();
    setPredictions(Array.isArray(data.predictions) ? data.predictions : []);
    setAuthenticated(true);
    setMessage("Исторический снимок. Новые прогнозы здесь не принимаются.");
  }
  useEffect(() => { void load().catch(() => setMessage("Сервис пока недоступен.")); }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      setPassword("");
      if (!response.ok) { setMessage("Вход не выполнен. Проверь данные или попробуй позже."); return; }
      await load();
    } catch { setMessage("Не удалось подключиться."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/logout", { method: "POST" });
      if (!response.ok) { setMessage("Не удалось завершить сессию."); return; }
      setAuthenticated(false);
      setPredictions([]);
      setMessage("Ты вышел из системы.");
    } catch { setMessage("Не удалось завершить сессию."); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 760, margin: "40px auto", padding: 20, fontFamily: "sans-serif" }}>
    <h1>Golden Whistle — проверка переноса</h1>
    <p>{message}</p>
    {!authenticated ? <form onSubmit={login}>
      <label>Участник <input value={username} onChange={e => setUsername(e.target.value)}
        autoComplete="username" required maxLength={100} /></label>
      <label>Пароль <input type="password" value={password}
        onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button type="submit" disabled={busy}>Войти</button>
    </form> : <>
      <button type="button" onClick={logout} disabled={busy}>Выйти</button>
      <h2>Мои прогнозы ({predictions.length})</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>Матч</th><th>Прогноз</th><th>Результат</th></tr></thead>
        <tbody>{predictions.map(p => <tr key={p.match_id}>
          <td>{p.home_team || "?"} — {p.away_team || "?"}</td>
          <td>{p.home_pred ?? "—"} : {p.away_pred ?? "—"}</td>
          <td>{p.home_score ?? "—"} : {p.away_score ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </main>;
}
