"use client";

import { useEffect, useState } from "react";

export default function TestParticipantLogin() {
  const afterLogin = () => { const requested = new URLSearchParams(window.location.search).get("next") || ""; return requested.startsWith("/test-") && !requested.startsWith("//") && !requested.includes("\\\\") ? requested : "/test-participant-home"; };
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/test/participant-session", { credentials: "same-origin", cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.authenticated) window.location.replace(afterLogin()); })
      .catch(() => {});
  }, []);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/test/participant-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ username, password })
      });
      if (response.ok) {
        window.location.assign(afterLogin());
        return;
      }
      setMessage(response.status === 429 ? "Слишком много попыток. Попробуй позже." :
        response.status === 404 ? "Тестовый вход участников здесь отключён." :
        response.status === 503 ? "Тестовая авторизация временно недоступна." :
        "Не удалось войти. Проверь логин и пароль.");
    } catch {
      setMessage("Ошибка соединения с тестовым сервером.");
    } finally {
      setBusy(false);
    }
  }

  return <main style={{ maxWidth: 440, margin: "64px auto", padding: 24 }}>
    <h1>Тестовый вход участника — Neon</h1>
    <p>Изолированная площадка. Пользовательский кабинет Neon для проверки переноса Footy.</p>
    <form onSubmit={signIn} style={{ display: "grid", gap: 12 }}>
      <label>Имя участника
        <input required autoComplete="username" maxLength={100} value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ display: "block", width: "100%" }} />
      </label>
      <label>Пароль
        <input required type="password" autoComplete="current-password" value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ display: "block", width: "100%" }} />
      </label>
      <button type="submit" disabled={busy}>{busy ? "Проверка…" : "Войти"}</button>
      <p role="status">{message}</p>
    </form>
    <p><a href="/test-change-password">Сменить тестовый пароль (после входа)</a></p>
  </main>;
}
