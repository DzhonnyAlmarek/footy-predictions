"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

type Props = {
  matchId: number;
  kickoffAt?: string | null;

  // оставляем, чтобы не ломать места, где их ещё передают
  homeScore?: number | null;
  awayScore?: number | null;

  homeTeamId: number;
  awayTeamId: number;
};

function isoToDateValue(iso?: string | null) {
  if (!iso) return "";
  if (String(iso).startsWith("2099-01-01")) return "";
  return String(iso).slice(0, 10);
}

function isoToTimeValue(iso?: string | null) {
  if (!iso) return "";
  const s = String(iso);
  if (s.startsWith("2099-01-01")) return "";
  // ожидаем ISO вида 2026-02-22T12:00:00.000Z
  // берём HH:MM
  const m = s.match(/T(\d{2}):(\d{2})/);
  if (!m) return "";
  return `${m[1]}:${m[2]}`;
}

export default function MatchRowActions({
  matchId,
  kickoffAt,
  homeTeamId,
  awayTeamId,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [teams, setTeams] = useState<Team[] | null>(null);

  const [date, setDate] = useState<string>(() => isoToDateValue(kickoffAt));
  const time = isoToTimeValue(kickoffAt);

  const [homeId, setHomeId] = useState<string>(String(homeTeamId));
  const [awayId, setAwayId] = useState<string>(String(awayTeamId));

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const mountedRef = useRef(false);

  async function patch(body: any) {
    const res = await fetch("/api/admin/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // важно: API ждёт id (а не match_id)
      body: JSON.stringify({ id: matchId, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `Ошибка (${res.status})`);
    return json;
  }

  async function ensureTeams() {
    if (teams) return;
    const { data, error } = await supabase
      .from("teams")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setTeams([]);
      return;
    }
    setTeams(data ?? []);
  }

  // ✅ Автосохранение даты
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    setMsg("сохраняю дату…");

    const t = setTimeout(async () => {
      try {
        setLoading(true);

        // если дата пустая — очищаем kickoff_at/deadline_at
        if (!date) {
          await patch({ kickoff_at: null, deadline_at: null });
        } else {
          // сервер у тебя ставит “техническое” время сам (или можно передать ISO)
          // тут передаём только kickoff_at датой (если у тебя на сервере уже обрабатывается date-поле — ок)
          // но в текущем API PATCH у тебя ожидает kickoff_at/deadline_at, поэтому передадим kickoff_at
          await patch({ kickoff_at: `${date}T12:00:00.000Z` });
        }

        setMsg("дата сохранена ✅");
        router.refresh();
      } catch (e: any) {
        setMsg(e?.message ?? "ошибка сохранения даты");
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, matchId]);

  async function saveTeams() {
    setMsg(null);

    const hId = Number(homeId);
    const aId = Number(awayId);

    if (!Number.isFinite(hId)) return setMsg("Выберите хозяев");
    if (!Number.isFinite(aId)) return setMsg("Выберите гостей");
    if (hId === aId) return setMsg("Команды должны быть разными");

    setLoading(true);
    try {
      await patch({ home_team_id: hId, away_team_id: aId });
      setMsg("команды сохранены ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения команд");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    setMsg(null);
    if (!confirm("Удалить матч?")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/matches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: matchId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Ошибка (${res.status})`);

      setMsg("удалено ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onInput={(e) => setDate((e.target as HTMLInputElement).value)}
          disabled={loading}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
          title="Дата матча (сохраняется автоматически)"
        />

        <span
          style={{ fontWeight: 900, opacity: 0.75 }}
          title="Время старта (берётся из kickoff_at)"
        >
          {time ? `🕒 ${time}` : "🕒 —"}
        </span>
      </div>

      <select
        value={homeId}
        onChange={(e) => setHomeId(e.target.value)}
        onFocus={ensureTeams}
        onClick={ensureTeams}
        disabled={loading}
        style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 200 }}
        title="Хозяева"
      >
        {(teams ?? []).length === 0 ? <option value={homeId}>Хозяева</option> : null}
        {(teams ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <select
        value={awayId}
        onChange={(e) => setAwayId(e.target.value)}
        onFocus={ensureTeams}
        onClick={ensureTeams}
        disabled={loading}
        style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 200 }}
        title="Гости"
      >
        {(teams ?? []).length === 0 ? <option value={awayId}>Гости</option> : null}
        {(teams ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={saveTeams}
        disabled={loading}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #111",
          background: "#111",
          color: "#fff",
          fontWeight: 900,
        }}
      >
        {loading ? "..." : "Сохранить пару"}
      </button>

      <button
        type="button"
        onClick={remove}
        disabled={loading}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #111",
          background: "#fff",
          fontWeight: 900,
        }}
      >
        Удалить
      </button>

      {msg ? (
        <span style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </span>
      ) : null}
    </div>
  );
}