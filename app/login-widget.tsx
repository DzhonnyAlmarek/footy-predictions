"use client";

import { useEffect, useRef, useState } from "react";

type Account = { login: string };

export default function LoginWidget() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState(""); // всегда пусто

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [capsOn, setCapsOn] = useState(false);

  const passRef = useRef<HTMLInputElement | null>(null);

  // загрузка логинов
  useEffect(() => {
    let mounted = true;

    async function load() {
      setMsg(null);
      try {
        const res = await fetch("/api/logins", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));

        if (!mounted) return;

        if (!res.ok) {
          setMsg(json?.error ?? "Не удалось загрузить логины");
          return;
        }

        const list = (json?.logins ?? []) as string[];
        const items = list.map((l) => ({ login: l }));
        setAccounts(items);

        if (items.length > 0) {
          setLogin(items[0].login);
          // фокус в пароль после первичной загрузки
          requestAnimationFrame(() => passRef.current?.focus());
        } else {
          setMsg("Список логинов пуст");
        }
      } catch {
        if (!mounted) return;
        setMsg("Ошибка загрузки логинов");
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  function onLoginChange(v: string) {
    setLogin(v);
    requestAnimationFrame(() => passRef.current?.focus());
  }

  function onPasswordKey(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsOn(!!e.getModifierState?.("CapsLock"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!login) return setMsg("Выберите логин");
    if (!password) return setMsg("Введите пароль");

    setLoading(true);
    try {
      // ✅ ВХОД ТОЛЬКО через /api/login
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const err = json?.error;
        setMsg(
          err === "wrong_password"
            ? "Неверный пароль"
            : err === "unknown_login"
            ? "Неизвестный логин"
            : json?.error ?? "Ошибка входа"
        );
        return;
      }

      window.location.href = json.redirect ?? "/dashboard";
    } catch {
      setMsg("Ошибка входа");
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
      <h2 style={{ fontSize: 20, fontWeight: 900 }}>Вход</h2>

      {/* Подсказка про первый вход */}
      <div
        style={{
          marginTop: 10,
          padding: 10,
          borderRadius: 10,
          background: "#f7f7f7",
          fontSize: 13,
        }}
      >
        При первом входе пароль по умолчанию: <b>12345</b>. После входа его нужно сменить.
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontWeight: 700 }}>Логин</label>
        <select
          value={login}
          onChange={(e) => onLoginChange(e.target.value)}
          disabled={loading || accounts.length === 0}
          style={{
            marginTop: 6,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        >
          {accounts.map((a) => (
            <option key={a.login} value={a.login}>
              {a.login}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", fontWeight: 700 }}>Пароль</label>
        <input
          ref={passRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onPasswordKey}
          onKeyUp={onPasswordKey}
          placeholder="Введите пароль"
          disabled={loading}
          autoComplete="current-password"
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
        disabled={loading || accounts.length === 0}
        style={{
          marginTop: 16,
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #111",
          background: loading || accounts.length === 0 ? "#777" : "#111",
          color: "#fff",
          fontWeight: 800,
          cursor: loading || accounts.length === 0 ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Вход..." : "Войти"}
      </button>
    </form>
  );
}
