"use client";

import { useEffect, useState } from "react";

type Account = { login: string };

export default function LoginWidget() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [login, setLogin] = useState<string>("");
  const [password, setPassword] = useState<string>(""); // ✅ ПУСТО

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setMsg(null);
      try {
        const res = await fetch("/api/logins", { cache: "no-store" });
        const json = await res.json();

        if (!mounted) return;

        if (!res.ok) {
          setMsg("Не удалось загрузить логины");
          return;
        }

        const list = (json?.logins ?? []) as string[];
        const items = list.map((l) => ({ login: l }));
        setAccounts(items);

        if (items.length > 0) setLogin(items[0].login);
        else setMsg("Список логинов пуст");
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

  async function submit() {
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
        const e = json?.error;
        setMsg(
          e === "wrong_password"
            ? "Неверный пароль"
            : e === "unknown_login"
            ? "Неизвестный логин"
            : "Ошибка входа"
        );
        return;
      }

      // ✅ редирект получаем с сервера
      window.location.href = json.redirect ?? "/dashboard/stages";
    } catch {
      setMsg("Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Пользователь</div>
          <select
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          >
            {accounts.map((a) => (
              <option key={a.login} value={a.login}>
                {a.login}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Пароль</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Введите пароль"
            autoComplete="current-password"
            style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={loading || accounts.length === 0}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: loading || accounts.length === 0 ? "#777" : "#111",
            color: "#fff",
            cursor: loading || accounts.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "..." : "Войти"}
        </button>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </div>
    </div>
  );
}
