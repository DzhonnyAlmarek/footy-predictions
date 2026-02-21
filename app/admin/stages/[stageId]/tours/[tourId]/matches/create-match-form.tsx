"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

function localInputValueToISO(v: string): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const d = new Date(t); // local
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export default function CreateMatchForm({ stageId, tourId }: { stageId: number; tourId: number }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [teams, setTeams] = useState<Team[] | null>(null);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");

  // ✅ дата+время
  const [kickoffLocal, setKickoffLocal] = useState<string>(""); // datetime-local
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function ensureTeams() {
    if (teams) return;
    setMsg(null);
    const { data, error } = await supabase.from("teams").select("id,name").order("name", { ascending: true });
    if (error) {
      setMsg(error.message);
      setTeams([]);
      return;
    }
    setTeams(data ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const h = Number(homeTeamId);
    const a = Number(awayTeamId);
    if (!Number.isFinite(h)) return setMsg("Выберите хозяев");
    if (!Number.isFinite(a)) return setMsg("Выберите гостей");
    if (h === a) return setMsg("Команды должны быть разными");

    const kickoffISO = localInputValueToISO(kickoffLocal);
    if (!kickoffISO) return setMsg("Укажите дату и время матча");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          tour_id: tourId,
          home_team_id: h,
          away_team_id: a,
          kickoff_at: kickoffISO,
          deadline_at: kickoffISO,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Ошибка создания матча (${res.status})`);

      setHomeTeamId("");
      setAwayTeamId("");
      setKickoffLocal("");
      setMsg("Матч создан ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка создания матча");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Добавить матч в тур</div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={homeTeamId}
          onChange={(e) => setHomeTeamId(e.target.value)}
          onFocus={ensureTeams}
          onClick={ensureTeams}
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
        >
          <option value="">Хозяева…</option>
          {(teams ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          value={awayTeamId}
          onChange={(e) => setAwayTeamId(e.target.value)}
          onFocus={ensureTeams}
          onClick={ensureTeams}
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
        >
          <option value="">Гости…</option>
          {(teams ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <input
          type="datetime-local"
          value={kickoffLocal}
          onChange={(e) => setKickoffLocal(e.target.value)}
          onInput={(e) => setKickoffLocal((e.target as HTMLInputElement).value)}
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          title="Дата и время начала матча"
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Создание..." : "Добавить"}
        </button>
      </div>

      {msg ? (
        <div style={{ marginTop: 10, fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Время задаётся админом. Сохраняется как точный момент времени (UTC) через ISO.
      </div>
    </form>
  );
}