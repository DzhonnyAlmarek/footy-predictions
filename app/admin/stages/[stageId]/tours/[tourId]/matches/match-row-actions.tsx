"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

export default function MatchRowActions(props: {
  stageStatus: string; // draft | published | locked
  matchId: number;

  initialHomeTeamId: number;
  initialAwayTeamId: number;
  initialKickoffAt: string;   // ISO
  initialDeadlineAt: string;  // ISO (равен kickoff)
  initialStatus: string;

  teams: Team[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // ✅ НОВОЕ: запрещаем только в locked
  const locked = props.stageStatus === "locked";

  const [editing, setEditing] = useState(false);
  const [homeTeamId, setHomeTeamId] = useState<number>(props.initialHomeTeamId);
  const [awayTeamId, setAwayTeamId] = useState<number>(props.initialAwayTeamId);

  const isoToLocal = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [kickoffLocal, setKickoffLocal] = useState<string>(isoToLocal(props.initialKickoffAt));
  const [status, setStatus] = useState<string>(props.initialStatus);

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setMsg(null);
    if (locked) return setMsg("Этап закрыт (locked) — редактирование запрещено");

    if (homeTeamId === awayTeamId) return setMsg("Команды должны быть разными");
    if (!kickoffLocal) return setMsg("Укажите дату матча");

    const kickoff = new Date(kickoffLocal);
    if (Number.isNaN(kickoff.getTime())) return setMsg("Некорректная дата");

    setLoading(true);
    try {
      const iso = kickoff.toISOString(); // дедлайн = дата матча

      const { error } = await supabase
        .from("matches")
        .update({
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          kickoff_at: iso,
          deadline_at: iso,
          status,
        })
        .eq("id", props.matchId);

      if (error) throw error;

      setEditing(false);
      router.refresh();
      setMsg("Сохранено ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    setMsg(null);
    if (locked) return setMsg("Этап закрыт (locked) — удаление запрещено");

    if (!confirm("Удалить матч?")) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("matches").delete().eq("id", props.matchId);
      if (error) throw error;

      router.refresh();
      setMsg("Удалено ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={locked || loading}
          title={locked ? "Этап locked — редактирование запрещено" : "Редактировать матч"}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#fff",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.6 : 1,
          }}
        >
          Редактировать
        </button>

        <button
          type="button"
          onClick={remove}
          disabled={locked || loading}
          title={locked ? "Этап locked — удаление запрещено" : "Удалить матч"}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#fff",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.6 : 1,
          }}
        >
          {loading ? "..." : "Удалить"}
        </button>

        {msg && <div style={{ color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>}
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 800 }}>Редактирование</div>

      {locked && (
        <div style={{ marginTop: 8, color: "crimson" }}>
          Этап закрыт (locked) — редактирование запрещено.
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Хозяева</span>
            <select
              value={homeTeamId}
              onChange={(e) => setHomeTeamId(Number(e.target.value))}
              disabled={loading || locked}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            >
              {props.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Гости</span>
            <select
              value={awayTeamId}
              onChange={(e) => setAwayTeamId(Number(e.target.value))}
              disabled={loading || locked}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            >
              {props.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Дата матча (это же дедлайн)</span>
          <input
            type="datetime-local"
            value={kickoffLocal}
            onChange={(e) => setKickoffLocal(e.target.value)}
            disabled={loading || locked}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Статус</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={loading || locked}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 220 }}
          >
            <option value="scheduled">scheduled</option>
            <option value="live">live</option>
            <option value="finished">finished</option>
            <option value="canceled">canceled</option>
          </select>
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={save}
            disabled={loading || locked}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: locked ? "not-allowed" : "pointer",
              opacity: locked ? 0.6 : 1,
            }}
          >
            {loading ? "..." : "Сохранить"}
          </button>

          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setHomeTeamId(props.initialHomeTeamId);
              setAwayTeamId(props.initialAwayTeamId);
              setKickoffLocal(isoToLocal(props.initialKickoffAt));
              setStatus(props.initialStatus);
              setMsg(null);
            }}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
            }}
          >
            Отмена
          </button>
        </div>

        {msg && <div style={{ color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>}
      </div>
    </div>
  );
}
