"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Account = {
  login: string;
  must_change_password?: boolean;
  temp_password?: string | null;
};

function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 10000, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...rest, signal: controller.signal }).finally(() =>
    clearTimeout(t)
  );
}

function normalizeLogin(v: string) {
  return String(v ?? "").trim().toUpperCase();
}

export default function LoginWidget() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [capsOn, setCapsOn] = useState(false);

  const passRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  const selectedAcc = useMemo(
    () => accounts.find((a) => a.login === login),
    [accounts, login]
  );

  const showTempHint = !!selectedAcc?.must_change_password;
  const tempPwd = (selectedAcc?.temp_password ?? "").trim() || "123456";

  useEffect(() => {
    let mounted = true;

    async function load() {
      // ⚠️ не затираем msg, если оно уже выставлено из sessionStorage
      setMsg((prev) => prev ?? null);

      // 1) читаем query и sessionStorage
      const sp = new URLSearchParams(window.location.search);
      const qpLogin = normalizeLogin(sp.get("login") ?? "");
      const changedParam = sp.get("changed");
      const changed =
        changedParam === "1" ||
        changedParam === "true" ||
        changedParam === "yes";

      const changedOnce = sessionStorage.getItem("fp_pwd_changed") === "1";

      try {
        const res = await fetchWithTimeout("/api/logins", {
          cache: "no-store",
          timeoutMs: 10000,
        });

        const json = await res.json().catch(() => ({}));
        if (!mounted) return;

        if (!res.ok) {
          setMsg(json?.error ?? "Не удалось загрузить логины");
          return;
        }

        const raw = json?.logins ?? [];
        const items: Account[] = (raw as any[]).map((x) =>
          typeof x === "string"
            ? { login: x }
            : {
                login: String(x.login),
                must_change_password: !!x.must_change_password,
                temp_password: x.temp_password ?? null,
              }
        );

        setAccounts(items);

        if (items.length === 0) {
          setMsg("Список логинов пуст");
          return;
        }

        // 2) выбираем логин из query (если есть)
        const found = qpLogin
          ? items.find((x) => normalizeLogin(x.login) === qpLogin)
          : null;

        const chosen = found?.login ?? items[0].login;
        setLogin(chosen);

        // 3) показываем сообщение (query или sessionStorage)
        if (changed || changedOnce) {
          setMsg("Пароль успешно изменён ✅ Войдите с новым паролем.");
          // гарантируем показ даже если URL дальше очистят/перезагрузят
          sessionStorage.setItem("fp_pwd_changed", "0");
        }

        if (changed) {
          // если пришли с changed=1 — сохраним флаг на один показ и очистим URL
          sessionStorage.setItem("fp_pwd_changed", "1");
          window.history.replaceState(
            {},
            "",
            "/?login=" + encodeURIComponent(chosen)
          );
        }

        requestAnimationFrame(() => passRef.current?.focus());
      } catch (e: any) {
        if (!mounted) return;
        setMsg(
          e?.name === "AbortError"
            ? "Таймаут загрузки логинов"
            : "Ошибка загрузки логинов"
        );
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  function onPasswordKey(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsOn(!!e.getModifierState?.("CapsLock"));
  }

  async function copyTempPassword() {
    try {
      await navigator.clipboard.writeText(tempPwd);
      setMsg("Временный пароль скопирован ✅");
    } catch {
      setMsg("Не удалось скопировать пароль");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!login) {
      setMsg("Выберите логин");
      requestAnimationFrame(() => selectRef.current?.focus());
      return;
    }
    if (!password) {
      setMsg("Введите пароль");
      requestAnimationFrame(() => passRef.current?.focus());
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
        cache: "no-store",
        timeoutMs: 10000,
        credentials: "include",
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

      window.location.href = json?.redirect ?? "/dashboard";
    } catch (e: any) {
      setMsg(
        e?.name === "AbortError"
          ? "Таймаут входа. Проверь сеть/сервер."
          : "Ошибка входа"
      );
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
        boxSizing: "border-box",
      }}
    >
      {showTempHint ? (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            background: "#f7f7f7",
            fontSize: 13,
            lineHeight: 1.4,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              Временный пароль: <b style={{ fontFamily: "monospace" }}>{tempPwd}</b>
            </div>

            <button
              type="button"
              onClick={copyTempPassword}
              disabled={loading}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Скопировать
            </button>
          </div>

          <div style={{ marginTop: 6 }}>После входа его нужно сменить.</div>
        </div>
      ) : null}

      <div>
        <label style={{ display: "block", fontWeight: 700 }}>Логин</label>
        <select
          ref={selectRef}
          value={login}
          onChange={(e) => {
            setLogin(e.target.value);
            requestAnimationFrame(() => passRef.current?.focus());
          }}
          disabled={loading || accounts.length === 0}
          style={{
            marginTop: 8,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            boxSizing: "border-box",
            background: "#fff",
          }}
        >
          {accounts.map((a) => (
            <option key={a.login} value={a.login}>
              {a.login}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
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
            marginTop: 8,
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            boxSizing: "border-box",
          }}
        />
        {capsOn ? (
          <div style={{ marginTop: 8, color: "crimson", fontSize: 12 }}>
            Включён Caps Lock
          </div>
        ) : null}
      </div>

      {msg ? (
        <div style={{ marginTop: 12, color: msg.includes("✅") ? "inherit" : "crimson", fontWeight: 700 }}>
          {msg}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading || accounts.length === 0}
        style={{
          marginTop: 16,
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #111",
          background: loading ? "#777" : "#111",
          color: "#fff",
          fontWeight: 800,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Вход..." : "Войти"}
      </button>
    </form>
  );
}
