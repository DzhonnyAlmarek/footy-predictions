"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

export default function CreateMatchForm({ stageId, tourId }: { stageId: number; tourId: number }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [teams, setTeams] = useState<Team[] | null>(null);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");

  const [date, setDate] = useState<string>(""); // YYYY-MM-DD
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
          date: date || "", // YYYY-MM-DD или пусто
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Ошибка создания матча (${res.status})`);

      setHomeTeamId("");
      setAwayTeamId("");
      setDate("");
      setMsg(`Матч создан ✅ (№ ${json?.stage_match_no ?? "?"})`);
      router.refresh();
    } catch (e: any) {
      // "Failed to fetch" теперь почти не должно быть, но если сервер упал — увидим
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

        {/* ✅ только дата, без времени */}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onInput={(e) => setDate((e.target as HTMLInputElement).value)}
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          title="Дата матча (время не требуется)"
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
        Дата фиксируется сразу при выборе. Время не вводим (на сервере ставится техническое 12:00 UTC).
      </div>
    </form>
  );
}
