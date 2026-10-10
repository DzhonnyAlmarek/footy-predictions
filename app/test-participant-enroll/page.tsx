"use client";

import { useState } from "react";

export default function ParticipantEnrollment() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!/^[a-f0-9]{64}$/i.test(token.trim())) {
      setMessage("Укажи действительный одноразовый код приглашения.");
      return;
    }
    if (password.length < 12 || password.length > 128 || new TextEncoder().encode(password).length > 256) {
      setMessage("Пароль должен содержать от 12 до 128 символов.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/test/enroll", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password })
      });
      if (response.ok) {
        setComplete(true);
        setToken("");
        setPassword("");
        setConfirmation("");
        setMessage("Тестовый пароль установлен. Теперь можно войти.");
      } else {
        setMessage(response.status === 404 ? "Установка паролей в этой среде отключена." :
          response.status === 429 ? "Слишком много попыток. Попробуй позже." :
          response.status === 503 ? "Сервис установки пароля временно недоступен." :
          "Приглашение недействительно, истекло или уже использовано.");
      }
    } catch {
      setMessage("Не удалось связаться с тестовым сервером.");
    } finally {
      setBusy(false);
    }
  }

  return <main style={{ maxWidth: 440, margin: "64px auto", padding: 24 }}>
    <h1>Активация тестового доступа — Neon</h1>
    <p>Только изолированная площадка Footy. Используй отдельный пароль, не пароль основного сайта.</p>
    {!complete && <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label>Одноразовый код приглашения
        <input required autoComplete="off" spellCheck={false} value={token}
          onChange={e => setToken(e.target.value)} maxLength={64}
          style={{ display: "block", width: "100%" }} />
      </label>
      <label>Новый тестовый пароль (не менее 12 символов)
        <input required type="password" autoComplete="new-password" value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ display: "block", width: "100%" }} />
      </label>
      <label>Повтори пароль
        <input required type="password" autoComplete="new-password" value={confirmation}
          onChange={e => setConfirmation(e.target.value)}
          style={{ display: "block", width: "100%" }} />
      </label>
      <button type="submit" disabled={busy}>{busy ? "Установка…" : "Установить тестовый пароль"}</button>
    </form>}
    <p role="status">{message}</p>
    {complete && <a href="/test-participant-login">Перейти ко входу участника</a>}
  </main>;
}
