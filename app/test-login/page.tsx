"use client";
import { useState } from "react";

export default function TestLoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/test/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ login, password })
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error === "test_auth_not_configured"
          ? "Тестовая авторизация ещё не настроена на сервере"
          : "Неверные данные или вход недоступен");
      } else {
        window.location.assign("/test-area");
      }
    } catch {
      setMessage("Не удалось выполнить вход");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 420, margin: "64px auto", padding: 24 }}>
      <h1>Тестовая площадка</h1>
      <p>Изолированная авторизация. Основной сайт и рабочая база не используются.</p>
      <form onSubmit={signIn} style={{ display: "grid", gap: 12 }}>
        <label>Тестовый логин<input required autoComplete="username" value={login}
          onChange={(e) => setLogin(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
        <label>Пароль<input required type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
        <button disabled={busy} type="submit">{busy ? "Проверка…" : "Войти"}</button>
        <p role="status">{message}</p>
      </form>
    </main>
  );
}
