"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setMsg(null);

    if (!p1 || p1.length < 5) return setMsg("Пароль минимум 5 символов");
    if (p1 !== p2) return setMsg("Пароли не совпадают");

    setLoading(true);
    try {
      // 1) меняем пароль
      const { error: passErr } = await supabase.auth.updateUser({ password: p1 });
      if (passErr) throw passErr;

      // 2) снимаем флаг обязательной смены
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setMsg("Сессия не найдена. Нажмите 'Выйти' и войдите снова.");
        return;
      }

      const { error: updErr } = await supabase
        .from("login_accounts")
        .update({ must_change_password: false })
        .eq("user_id", user.id);

      if (updErr) throw updErr;

      // 3) на главную — она сама отправит в /admin или /dashboard
      window.location.href = "/";
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Новый пароль</span>
          <input
            type="password"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Повторите пароль</span>
          <input
            type="password"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <button
          onClick={submit}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            width: 220,
          }}
        >
          {loading ? "..." : "Сохранить пароль"}
        </button>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </div>
    </div>
  );
}
