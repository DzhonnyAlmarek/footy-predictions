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

    if (p1.length < 6) {
      setMsg("Пароль должен быть не короче 6 символов");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: p1 }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(json?.error || "Ошибка");
        return;
      }

      window.location.href = json.redirect ?? "/dashboard";
    } catch {
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
        padding: 20,
        maxWidth: 420,
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 900 }}>Смена пароля</h2>

      {/* ✅ ПОДСКАЗКА */}
      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 10,
          background: "#f7f7f7",
          fontSize: 13,
        }}
      >
        Пароль должен быть не короче <b>6 символов</b>.
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ fontWeight: 700 }}>Новый пароль</label>
        <input
          ref={p1Ref}
          value={p1}
          onChange={(e) => setP1(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          type="password"
          autoComplete="new-password"
          disabled={loading}
          style={{
            marginTop: 6,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 700 }}>Повторите пароль</label>
        <input
          value={p2}
          onChange={(e) => setP2(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          type="password"
          autoComplete="new-password"
          disabled={loading}
          style={{
            marginTop: 6,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
        {capsOn && (
          <div style={{ marginTop: 4, color: "crimson", fontSize: 12 }}>
            Включён Caps Lock
          </div>
        )}
      </div>

      {msg && (
        <div style={{ marginTop: 10, color: "crimson", fontWeight: 700 }}>
          {msg}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: 16,
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {loading ? "..." : "Сохранить пароль"}
      </button>
    </form>
  );
}
