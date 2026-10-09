"use client";

import { useEffect, useState } from "react";

export default function TestAreaPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [status, setStatus] = useState("Проверяем тестовый вход…");

  useEffect(() => {
    let active = true;
    fetch("/api/test/session", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Session unavailable");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        if (!data.authenticated || typeof data.username !== "string") {
          window.location.replace("/test-login");
          return;
        }
        setUsername(data.username);
        setStatus("");
      })
      .catch(() => { if (active) setStatus("Не удалось проверить тестовую сессию"); });
    return () => { active = false; };
  }, []);

  async function logout() {
    await fetch("/api/test/logout", { method: "POST", credentials: "same-origin" });
    window.location.assign("/test-login");
  }

  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: 24 }}>
      <h1>Тестовый кабинет</h1>
      {status && <p role="status">{status}</p>}
      {username && <>
        <p>Вход выполнен: <strong>{username}</strong></p>
        <p>Это искусственный участник тестовой Neon. Рабочие прогнозы и API отключены.</p>
        <p><a href="/test-matches">Посмотреть тестовые матчи</a></p>
        <p><a href="/test-schedule">Расписание этапов и туров</a></p>
        <button onClick={logout}>Выйти</button>
      </>}
    </main>
  );
}
