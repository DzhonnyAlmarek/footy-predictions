"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  login: string;
  user_id: string;
  must_change_password: boolean;
  profiles?: { role: string; username: string } | null;
};

const DEFAULT_CREATE_PASSWORD = "123456"; // минимум 6 символов для Supabase

export default function UsersEditor({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ UX для кнопки и показа временного пароля
  const [resetDone, setResetDone] = useState<Record<string, boolean>>({});
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});

  const [newLogin, setNewLogin] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  async function create() {
    setMsg(null);
    const login = newLogin.trim();
    if (!login) return setMsg("Введите логин");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, role: newRole, password: DEFAULT_CREATE_PASSWORD }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Ошибка создания");

      setNewLogin("");
      setNewRole("user");
      router.refresh();
      setMsg(`Пользователь создан ✅ (пароль ${DEFAULT_CREATE_PASSWORD}, смена обязательна)`);
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function save(user_id: string, login: string, role: string) {
    setMsg(null);
    const newLogin = login.trim();
    if (!newLogin) return setMsg("Логин не может быть пустым");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, login: newLogin, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Ошибка сохранения");

      router.refresh();
      setMsg("Сохранено ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(user_id: string) {
    setMsg(null);
    if (!confirm("Сбросить пароль и выдать временный пароль?")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, reset_password: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Ошибка сброса");

      const temp = String(json?.tempPassword ?? "").trim();
      if (!temp) throw new Error("Сброс выполнен, но сервер не вернул tempPassword");

      // ✅ UI: кнопка -> "Пароль сброшен"
      setResetDone((m) => ({ ...m, [user_id]: true }));
      // ✅ показываем временный пароль админу
      setTempPasswords((m) => ({ ...m, [user_id]: temp }));

      // ✅ локально обновим must_change_password, чтобы сразу было видно
      setRows((prev) =>
        prev.map((r) =>
          r.user_id === user_id ? { ...r, must_change_password: true } : r
        )
      );

      router.refresh();
      setMsg(`Пароль сброшен ✅ Временный пароль: ${temp}`);
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function remove(user_id: string, login: string) {
    setMsg(null);
    if (!confirm(`Удалить пользователя ${login}? Действие необратимо.`)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Ошибка удаления");

      setRows((prev) => prev.filter((r) => r.user_id !== user_id));
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function updateLocal(user_id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.user_id === user_id ? { ...r, ...patch } : r)));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Скопировано ✅");
    } catch {
      setMsg("Не удалось скопировать");
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Новый пользователь</div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={newLogin}
          onChange={(e) => setNewLogin(e.target.value)}
          placeholder="Логин (например: ИВАН)"
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 240 }}
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as any)}
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>

        <button
          onClick={create}
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
          }}
        >
          {loading ? "..." : `Создать (пароль ${DEFAULT_CREATE_PASSWORD})`}
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        {rows.map((r) => {
          const role = r.profiles?.role ?? "user";
          const done = !!resetDone[r.user_id];
          const temp = tempPasswords[r.user_id];

          return (
            <div key={r.user_id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={r.login}
                    onChange={(e) => updateLocal(r.user_id, { login: e.target.value })}
                    disabled={loading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 200 }}
                  />
                  <select
                    value={role}
                    onChange={(e) =>
                      updateLocal(r.user_id, {
                        profiles: { ...(r.profiles ?? { username: r.login }), role: e.target.value },
                      })
                    }
                    disabled={loading}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>

                  <span style={{ opacity: 0.8 }}>
                    must_change_password: <b>{r.must_change_password ? "true" : "false"}</b>
                  </span>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => save(r.user_id, r.login, r.profiles?.role ?? "user")}
                    disabled={loading}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      fontWeight: 900,
                    }}
                  >
                    Сохранить
                  </button>

                  <button
                    onClick={() => resetPassword(r.user_id)}
                    disabled={loading || done}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: done ? "rgba(34,197,94,0.14)" : "#fff",
                      color: done ? "#14532d" : "#111",
                      fontWeight: 900,
                      cursor: done ? "default" : "pointer",
                      opacity: loading ? 0.75 : 1,
                    }}
                  >
                    {done ? "Пароль сброшен" : "Сброс пароля"}
                  </button>

                  <button
                    onClick={() => remove(r.user_id, r.login)}
                    disabled={loading}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#fff",
                      fontWeight: 900,
                    }}
                  >
                    Удалить
                  </button>

                  {temp ? (
                    <span
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(34,197,94,0.35)",
                        background: "rgba(34,197,94,0.12)",
                        fontWeight: 900,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                      title="Временный пароль (пользователь обязан сменить при входе)"
                    >
                      Временный пароль: <span style={{ fontFamily: "monospace" }}>{temp}</span>
                      <button
                        type="button"
                        onClick={() => copy(temp)}
                        disabled={loading}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(0,0,0,0.15)",
                          background: "#fff",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        Копировать
                      </button>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
