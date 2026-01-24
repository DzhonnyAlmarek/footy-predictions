"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const errorParam = sp.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Аккаунт создан. Если включено подтверждение email — проверьте почту.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      setMsg(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        {mode === "login" ? "Вход" : "Регистрация"}
      </h1>

      {errorParam && (
        <p style={{ marginBottom: 12, color: "crimson" }}>
          Ошибка: {errorParam}
        </p>
      )}

      {msg && <p style={{ marginBottom: 12 }}>{msg}</p>}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <input
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />

        <button
          disabled={loading}
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {loading ? "..." : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>
      </form>

      <div style={{ marginTop: 14 }}>
        {mode === "login" ? (
          <button
            onClick={() => setMode("signup")}
            style={{ background: "transparent", border: "none", color: "#111", cursor: "pointer", textDecoration: "underline" }}
          >
            Нет аккаунта? Регистрация
          </button>
        ) : (
          <button
            onClick={() => setMode("login")}
            style={{ background: "transparent", border: "none", color: "#111", cursor: "pointer", textDecoration: "underline" }}
          >
            Уже есть аккаунт? Вход
          </button>
        )}
      </div>
    </main>
  );
}
