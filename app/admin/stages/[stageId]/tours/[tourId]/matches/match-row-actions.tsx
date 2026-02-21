"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

type Props = {
  matchId: number;
  kickoffAt?: string | null;
  deadlineAt?: string | null;
  homeTeamId: number;
  awayTeamId: number;
};

function isoToLocalInputValue(iso?: string | null) {
  if (!iso) return "";
  const s = String(iso);
  if (s.startsWith("2099-01-01")) return "";

  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());

  // datetime-local: YYYY-MM-DDTHH:MM
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localInputValueToISO(v: string): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const d = new Date(t); // интерпретирует как local time
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString(); // перевод в UTC ISO (момент времени сохраняется корректно)
}

export default function MatchRowActions({
  matchId,
  kickoffAt,
  deadlineAt,
  homeTeamId,
  awayTeamId,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [teams, setTeams] = useState<Team[] | null>(null);

  // ✅ дата+время
  const [kickoffLocal, setKickoffLocal] = useState<string>(() => isoToLocalInputValue(kickoffAt));
  const [homeId, setHomeId] = useState<string>(String(homeTeamId));
  const [awayId, setAwayId] = useState<string>(String(awayTeamId));

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const mountedRef = useRef(false);

  async function patch(body: any) {
    const res = await fetch("/api/admin/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `Ошибка (${res.status})`);
    return json;
  }

  async function ensureTeams() {
    if (teams) return;
    const { data, error } = await supabase.from("teams").select("id,name").order("name", { ascending: true });
    if (error) {
      setMsg(error.message);
      setTeams([]);
      return;
    }
    setTeams(data ?? []);
  }

  // ✅ Автосохранение kickoff_at (дата+время)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    setMsg("сохраняю дату/время…");

    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const kickoffISO = localInputValueToISO(kickoffLocal);

        await patch({
          kickoff_at: kickoffISO,
          // deadline_at можно оставить равным kickoff_at или null — как тебе удобнее
          // (сейчас: если kickoff пустой — чистим оба)
          deadline_at: kickoffISO,
        });

        setMsg("дата/время сохранены ✅");
        router.refresh();
      } catch (e: any) {
        setMsg(e?.message ?? "ошибка сохранения даты/времени");
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickoffLocal, matchId]);

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

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      {/* ✅ дата + время */}
      <input
        type="datetime-local"
        value={kickoffLocal}
        onChange={(e) => setKickoffLocal(e.target.value)}
        onInput={(e) => setKickoffLocal((e.target as HTMLInputElement).value)}
        disabled={loading}
        style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
        title="Дата и время начала матча (сохраняется автоматически)"
      />

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
        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #111", background: "#fff", fontWeight: 900 }}
      >
        Удалить
      </button>

      {msg ? (
        <span style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</span>
      ) : null}
    </div>
  );
}