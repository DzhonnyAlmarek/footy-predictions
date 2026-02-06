"use client";

import { useEffect, useRef, useState } from "react";

export default function PasswordForm() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [capsOn, setCapsOn] = useState(false);

  const p1Ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    p1Ref.current?.focus();
  }, []);

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsOn(!!e.getModifierState?.("CapsLock"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (p1.trim().length < 5) {
      setMsg("Пароль должен быть минимум 5 символов");
      return;
    }

    if (p1 !== p2) {
      setMsg("Пароли не совпадают");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        credentials: "include", // 🔴 ОБЯЗАТЕЛЬНО
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: p1 }), // 🔴 правильное поле
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(json?.error ?? "Ошибка");
        return;
      }

      // 🔴 КЛЮЧЕВОЙ МОМЕНТ:
      // API должен вернуть redirect вида:
      // "/?login=КЕН&changed=1"
      const redirectTo =
        typeof json?.redirect === "string" && json.redirect
          ? json.redirect
          : "/";

      window.location.href = redirectTo;
    } catch (e) {
      setMsg("Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Новый пароль</div>
          <input
            ref={p1Ref}
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            onKeyDown={onKey}
            onKeyUp={onKey}
            type="password"
            placeholder="Введите новый пароль"
            autoComplete="new-password"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Повторите пароль</div>
          <input
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            onKeyDown={onKey}
            onKeyUp={onKey}
            type="password"
            placeholder="Повторите новый пароль"
            autoComplete="new-password"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
            }}
          />
          {capsOn && (
            <div style={{ color: "crimson", fontSize: 12 }}>
              Включён Caps Lock
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {loading ? "..." : "Сохранить пароль"}
        </button>

        {msg && <div style={{ color: "crimson", fontWeight: 700 }}>{msg}</div>}
      </div>
    </form>
  );
}
