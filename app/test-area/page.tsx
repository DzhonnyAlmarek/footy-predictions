"use client";
export default function TestAreaPage() {
  async function logout() {
    await fetch("/api/test/logout", { method: "POST", credentials: "same-origin" });
    window.location.assign("/test-login");
  }
  return (
    <main style={{ maxWidth: 640, margin: "64px auto", padding: 24 }}>
      <h1>Тестовый доступ подтверждён</h1>
      <p>Это безопасная проверка входа. Рабочие прогнозы, результаты и API отключены.</p>
      <button onClick={logout}>Выйти</button>
    </main>
  );
}
