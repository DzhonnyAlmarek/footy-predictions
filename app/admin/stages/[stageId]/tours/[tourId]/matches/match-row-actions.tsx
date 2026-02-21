"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

type Props = {
  matchId: number;
  kickoffAt?: string | null;
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Мы храним только дату (YYYY-MM-DD) в UI,
 * а на сервер отправляем kickoff_at как техническое время 12:00:00Z
 * (чтобы было валидное timestamptz).
 */
function dateToKickoffIso(date: string): string | null {
  const v = (date ?? "").trim();
  if (!v) return null;
  // ВАЖНО: фиксированное время.
  return `${v}T12:00:00.000Z`;
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
  const [homeId, setHomeId] = useState<string>(String(homeTeamId));
  const [awayId, setAwayId] = useState<string>(String(awayTeamId));

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const mountedRef = useRef(false);

  async function patch(body: any) {
    const res = await fetch("/api/admin/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // ✅ сервер ждёт id, а не match_id
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

  // ✅ Автосохранение даты (kickoff_at)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    setMsg("сохраняю дату…");

    const t = setTimeout(async () => {
      try {
        setLoading(true);

        const kickoff_iso = dateToKickoffIso(date);
        await patch({
          kickoff_at: kickoff_iso,
          // deadline_at можно тоже держать рядом, но ты просил без дедлайна в напоминаниях.
          // Если хочешь — можем отдельно задать deadline_at = kickoff_at.
        });

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
        body: JSON.stringify({ match_id: matchId }),
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

  const timeLabel = isoToTimeValue(kickoffAt) || "—";

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onInput={(e) => setDate((e.target as HTMLInputElement).value)}
          disabled={loading}
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
          title="Дата матча (сохраняется автоматически)"
        />

        {/* ✅ время рядом с датой (только отображение) */}
        <span
          style={{
            fontWeight: 900,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(17,24,39,.12)",
            background: "rgba(255,255,255,.8)",
          }}
          title="Время начала матча (из kickoff_at)"
        >
          🕒 {timeLabel}
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

      {/* ✅ УБРАЛИ блок счёта и кнопку “Сохранить счёт” */}

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