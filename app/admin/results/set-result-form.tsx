"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ScoreRow = { user_id: string; match_id: number; points: number; reason: string };

export default function AdminSetResultForm(props: {
  matchId: number;
  defaultHome: number | "";
  defaultAway: number | "";
  defaultStatus: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [home, setHome] = useState<string>(String(props.defaultHome ?? ""));
  const [away, setAway] = useState<string>(String(props.defaultAway ?? ""));
  const [status, setStatus] = useState<string>(props.defaultStatus ?? "scheduled");

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [scoreMsg, setScoreMsg] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);

  async function save() {
    setMsg(null);
    setSavedOk(false);

    const homeN = home === "" ? null : Number(home);
    const awayN = away === "" ? null : Number(away);

    if (homeN !== null && (!Number.isInteger(homeN) || homeN < 0)) return setMsg("home_score должен быть целым 0+ или пусто");
    if (awayN !== null && (!Number.isInteger(awayN) || awayN < 0)) return setMsg("away_score должен быть целым 0+ или пусто");

    setLoading(true);
    try {
      const { error } = await supabase
        .from("matches")
        .update({ home_score: homeN, away_score: awayN, status })
        .eq("id", props.matchId);

      if (error) throw error;

      setMsg("Сохранено ✅");
      setSavedOk(true);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function score() {
    setScoreMsg(null);
    setScoring(true);
    try {
      const { data, error } = await supabase.rpc("score_match", { p_match_id: props.matchId });
      if (error) throw error;

      const rows = (data ?? []) as ScoreRow[];
      const total = rows.reduce((s, r) => s + (r.points ?? 0), 0);

      setScoreMsg(
        rows.length === 0
          ? "Начислено: прогнозов нет"
          : `Начислено ✅ пользователям: ${rows.length}, сумма очков: ${total}`
      );

      router.refresh();
    } catch (e: any) {
      setScoreMsg(e?.message ?? "Ошибка начисления");
    } finally {
      setScoring(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={home}
          onChange={(e) => setHome(e.target.value)}
          inputMode="numeric"
          placeholder="home"
          style={{ width: 90, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
        />
        <span style={{ fontWeight: 800 }}>:</span>
        <input
          value={away}
          onChange={(e) => setAway(e.target.value)}
          inputMode="numeric"
          placeholder="away"
          style={{ width: 90, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
        >
          <option value="scheduled">scheduled</option>
          <option value="live">live</option>
          <option value="finished">finished</option>
          <option value="canceled">canceled</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid " + (savedOk ? "rgba(34,197,94,0.9)" : "#111"),
            background: savedOk ? "rgba(34,197,94,0.12)" : "#111",
            color: savedOk ? "rgba(21,128,61,1)" : "#fff",
            cursor: "pointer",
            width: 220,
            fontWeight: 900,
          }}
        >
          {loading ? "..." : savedOk ? "Сохранено успешно" : "Сохранить"}
        </button>

        <button
          onClick={score}
          disabled={scoring}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            cursor: "pointer",
            width: 200,
            fontWeight: 900,
          }}
          title="Пересчитает очки по матчу"
        >
          {scoring ? "..." : "Начислить очки"}
        </button>
      </div>

      {msg ? <p>{msg}</p> : null}
      {scoreMsg ? <p>{scoreMsg}</p> : null}
    </div>
  );
}
