"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tournament = { id: number; name: string; slug: string };
type Team = { id: number; name: string; slug: string };

export default function AdminCreateMatchForm({
  tournaments,
  teams,
}: {
  tournaments: Tournament[];
  teams: Team[];
}) {
  const supabase = useMemo(() => createClient(), []);

  const [tournamentId, setTournamentId] = useState<number | "">(
    tournaments[0]?.id ?? ""
  );
  const [homeTeamId, setHomeTeamId] = useState<number | "">(teams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState<number | "">(teams[1]?.id ?? "");
  const [kickoffAt, setKickoffAt] = useState<string>("");
  const [deadlineMinutes, setDeadlineMinutes] = useState<number>(30);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createMatch() {
    setMsg(null);

    if (!tournamentId) return setMsg("Выберите турнир");
    if (!homeTeamId || !awayTeamId) return setMsg("Выберите команды");
    if (homeTeamId === awayTeamId) return setMsg("Команды должны быть разными");
    if (!kickoffAt) return setMsg("Выберите дату/время kickoff");

    const kickoff = new Date(kickoffAt);
    if (Number.isNaN(kickoff.getTime())) return setMsg("Некорректная дата");

    const deadline = new Date(kickoff.getTime() - deadlineMinutes * 60 * 1000);

    setLoading(true);
    try {
      const { error } = await supabase.from("matches").insert({
        tournament_id: tournamentId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: kickoff.toISOString(),
        deadline_at: deadline.toISOString(),
        status: "scheduled",
      });

      if (error) throw error;

      setMsg("Матч создан ✅ (обновите главную, чтобы увидеть)");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>Новый матч</h2>

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Турнир</span>
          <select
            value={tournamentId}
            onChange={(e) => setTournamentId(Number(e.target.value))}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Хозяева</span>
            <select
              value={homeTeamId}
              onChange={(e) => setHomeTeamId(Number(e.target.value))}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            >
              {teams.map((t) => (
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
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Kickoff (локальное время в браузере)</span>
          <input
            type="datetime-local"
            value={kickoffAt}
            onChange={(e) => setKickoffAt(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Дедлайн за (минут) до kickoff</span>
          <input
            type="number"
            value={deadlineMinutes}
            onChange={(e) => setDeadlineMinutes(Number(e.target.value))}
            min={0}
            max={24 * 60}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 200 }}
          />
        </label>

        <button
          onClick={createMatch}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            width: 200,
          }}
        >
          {loading ? "..." : "Создать матч"}
        </button>

        {msg && <p>{msg}</p>}
      </div>
    </div>
  );
}
