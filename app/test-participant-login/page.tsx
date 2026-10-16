"use client";

import { useEffect, useState } from "react";

export default function TestParticipantLogin() {
  const afterLogin = (account: string) => { const requested = new URLSearchParams(window.location.search).get("next") || ""; return requested.startsWith("/test-") && !requested.startsWith("//") && !requested.includes("\\\\") ? requested : account === "ADMIN" ? "/test-admin-home" : "/test-participant-home"; };
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<string[]>([]);
  const [usersError, setUsersError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/test/participant-users", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("Не удалось загрузить список участников"); return r.json(); })
      .then(data => setUsers(Array.isArray(data.users) ? data.users : []))
      .catch(() => setUsersError("Список участников временно недоступен."));
    fetch("/api/test/participant-session", { credentials: "same-origin", cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.authenticated) window.location.replace(afterLogin(data.username)); })
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
        window.location.assign(afterLogin(username));
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
      <label>Пользователь
        <select required value={username} onChange={e => setUsername(e.target.value)} style={{ display: "block", width: "100%" }}>
          <option value="">Выбери пользователя</option>
          {users.map(user => <option key={user} value={user}>{user}</option>)}
        </select>
      </label>
      {usersError && <p role="alert">{usersError}</p>}
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
