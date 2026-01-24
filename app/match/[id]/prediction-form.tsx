"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PredictionForm(props: {
  matchId: number;
  homeName: string;
  awayName: string;
  deadlineAt: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const deadline = useMemo(() => new Date(props.deadlineAt), [props.deadlineAt]);

  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  const [home, setHome] = useState<string>("");
  const [away, setAway] = useState<string>("");

  const [msg, setMsg] = useState<string | null>(null);

  const isOpen = new Date() < deadline;

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!mounted) return;

      setAuthed(!!user);

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("predictions")
        .select("home_pred, away_pred")
        .eq("match_id", props.matchId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setMsg(`Ошибка загрузки прогноза: ${error.message}`);
      } else if (data) {
        setHome(String(data.home_pred));
        setAway(String(data.away_pred));
      }

      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [supabase, props.matchId]);

  async function save() {
    setMsg(null);

    if (!authed) {
      setMsg("Нужно войти в аккаунт.");
      return;
    }

    if (!isOpen) {
      setMsg("Дедлайн прошёл — прогнозы закрыты.");
      return;
    }

    const homeN = Number(home);
    const awayN = Number(away);

    if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
      setMsg("Введите целые числа 0+.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setMsg("Сессия не найдена. Перезайдите.");
      return;
    }

    // upsert по уникальному (match_id, user_id)
    const { error } = await supabase.from("predictions").upsert(
      {
        match_id: props.matchId,
        user_id: user.id,
        home_pred: homeN,
        away_pred: awayN,
      },
      { onConflict: "match_id,user_id" }
    );

    if (error) {
      setMsg(`Ошибка сохранения: ${error.message}`);
      return;
    }

    setMsg("Сохранено ✅");
  }

  if (loading) {
    return <p>Загрузка…</p>;
  }

  if (!authed) {
    return (
      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <p>Вы не вошли.</p>
        <p style={{ marginTop: 8 }}>
          <a href="/login" style={{ textDecoration: "underline" }}>
            Войти / зарегистрироваться
          </a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>{props.homeName}</span>
          <input
            value={home}
            onChange={(e) => setHome(e.target.value)}
            inputMode="numeric"
            disabled={!isOpen}
            style={{ width: 120, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 18 }}>:</div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>{props.awayName}</span>
          <input
            value={away}
            onChange={(e) => setAway(e.target.value)}
            inputMode="numeric"
            disabled={!isOpen}
            style={{ width: 120, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <button
          onClick={save}
          disabled={!isOpen}
          style={{
            marginTop: 18,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: isOpen ? "#111" : "#999",
            color: "#fff",
            cursor: isOpen ? "pointer" : "not-allowed",
          }}
        >
          Сохранить
        </button>
      </div>

      {!isOpen && (
        <p style={{ marginTop: 12, color: "crimson" }}>
          Дедлайн прошёл — редактирование заблокировано.
        </p>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
