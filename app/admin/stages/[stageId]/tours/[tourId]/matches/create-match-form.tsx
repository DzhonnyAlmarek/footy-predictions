"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string; slug: string };

export default function CreateMatchInTourForm(props: {
  stageId: number;
  tourId: number;
  stageStatus: string;
  teams: Team[];
  usedTeamIds: number[]; // 👈 добавили
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const disabled = props.stageStatus !== "draft";

  // Скрываем уже использованные команды тура
  const availableTeams = props.teams.filter((t) => !props.usedTeamIds.includes(t.id));

  const [homeTeamId, setHomeTeamId] = useState<number | "">(availableTeams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState<number | "">(availableTeams[1]?.id ?? "");
  const [kickoffAt, setKickoffAt] = useState<string>("");

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create() {
    setMsg(null);

    if (disabled) return setMsg("Этап не в draft — добавлять матчи нельзя.");
    if (!homeTeamId || !awayTeamId) return setMsg("Выберите команды");
    if (homeTeamId === awayTeamId) return setMsg("Команды должны быть разными");
    if (!kickoffAt) return setMsg("Укажите дату матча");

    const kickoff = new Date(kickoffAt);
    if (Number.isNaN(kickoff.getTime())) return setMsg("Некорректная дата");

    setLoading(true);
    try {
      // дедлайн = дата матча
      const iso = kickoff.toISOString();

      const { error } = await supabase.from("matches").insert({
        stage_id: props.stageId,
        tour_id: props.tourId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: iso,
        deadline_at: iso,
        status: "scheduled",
        // stage_match_no не задаём — БД поставит автоматически
      });

      if (error) throw error;

      setMsg("Матч добавлен ✅");
      setKickoffAt("");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800 }}>Добавить матч в тур</div>

      {disabled && (
        <div style={{ marginTop: 8, color: "crimson" }}>
          Этап не в draft — добавлять/удалять матчи нельзя.
        </div>
      )}

      {availableTeams.length < 2 && (
        <div style={{ marginTop: 8, color: "crimson" }}>
          В этом туре уже использованы почти все команды — добавить матч нельзя.
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Хозяева</span>
            <select
              value={homeTeamId}
              onChange={(e) => setHomeTeamId(Number(e.target.value))}
              disabled={disabled || availableTeams.length < 2}
              style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
            >
              {availableTeams.map((t) => (
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
              disabled={disabled || availableTeams.length < 2}
              style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
            >
              {availableTeams.map((t) => (
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
            value={kickoffAt}
            onChange={(e) => setKickoffAt(e.target.value)}
            disabled={disabled || availableTeams.length < 2}
            style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          />
        </label>

        <button
          onClick={create}
          disabled={disabled || loading || availableTeams.length < 2}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: disabled || availableTeams.length < 2 ? "#777" : "#111",
            color: "#fff",
            cursor: disabled || availableTeams.length < 2 ? "not-allowed" : "pointer",
            width: 220,
          }}
        >
          {loading ? "..." : "Добавить матч"}
        </button>

        {msg && <div style={{ color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>}
      </div>
    </div>
  );
}
