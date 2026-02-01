"use client";

import { useState } from "react";

export default function PasswordForm() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (password.length < 6) {
      setMsg("Новый пароль должен быть не менее 6 символов");
      return;
    }
    if (password !== password2) {
      setMsg("Пароли не совпадают");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? "Ошибка смены пароля");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setMsg("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, maxWidth: 520 }}
    >
      <div style={{ fontWeight: 900, fontSize: 18 }}>Смена пароля</div>

      <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
        Подсказка: длина нового пароля должна быть <b>не менее 6 символов</b>.
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 700 }}>Новый пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          style={{
            marginTop: 8,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 700 }}>Повторите пароль</label>
        <input
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          disabled={loading}
          style={{
            marginTop: 8,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            boxSizing: "border-box",
          }}
        />
      </div>

      {msg ? <div style={{ marginTop: 12, color: "crimson", fontWeight: 800 }}>{msg}</div> : null}

      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontWeight: 900,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "..." : "Сменить пароль"}
      </button>
    </form>
  );
}
