"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stage = { id: number; name: string };
type Tour = { id: number; tour_no: number; name: string | null };
type Team = { id: number; name: string };

export default function CreateMatchForm() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [stages, setStages] = useState<Stage[] | null>(null);
  const [tours, setTours] = useState<Tour[] | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);

  const [stageId, setStageId] = useState<string>("");
  const [tourId, setTourId] = useState<string>("");
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");

  async function ensureStages() {
    if (stages) return;
    const { data, error } = await supabase.from("stages").select("id,name").order("id", { ascending: false });
    if (error) return setMsg(error.message);
    setStages(data ?? []);
  }

  async function ensureTeams() {
    if (teams) return;
    const { data, error } = await supabase.from("teams").select("id,name").order("name", { ascending: true });
    if (error) return setMsg(error.message);
    setTeams(data ?? []);
  }

  async function loadTours(sId: number) {
    setTours(null);
    setTourId("");
    const { data, error } = await supabase
      .from("tours")
      .select("id,tour_no,name")
      .eq("stage_id", sId)
      .order("tour_no", { ascending: true });
    if (error) return setMsg(error.message);
    setTours(data ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const sId = Number(stageId);
    const tId = Number(tourId);
    const hId = Number(homeTeamId);
    const aId = Number(awayTeamId);

    if (!Number.isFinite(sId)) return setMsg("Выберите этап");
    if (!Number.isFinite(tId)) return setMsg("Выберите тур");
    if (!Number.isFinite(hId)) return setMsg("Выберите хозяев");
    if (!Number.isFinite(aId)) return setMsg("Выберите гостей");
    if (hId === aId) return setMsg("Команды должны быть разными");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: sId,
          tour_id: tId,
          home_team_id: hId,
          away_team_id: aId,
          kickoff_at: null,
          deadline_at: null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Ошибка создания матча (${res.status})`);

      setHomeTeamId("");
      setAwayTeamId("");
      setMsg(`Матч создан ✅ (№ ${json?.stage_match_no ?? "?"})`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка создания матча");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Создать матч</div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              const v = Number(e.target.value);
              if (Number.isFinite(v)) loadTours(v);
            }}
            onFocus={ensureStages}
            onClick={ensureStages}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 240 }}
          >
            <option value="">Этап…</option>
            {(stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} — {s.name}
              </option>
            ))}
          </select>

          <select
            value={tourId}
            onChange={(e) => setTourId(e.target.value)}
            disabled={loading || !stageId}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
          >
            <option value="">{stageId ? "Тур…" : "Сначала выберите этап"}</option>
            {(tours ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                Тур {t.tour_no}
                {t.name ? ` — ${t.name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            value={homeTeamId}
            onChange={(e) => setHomeTeamId(e.target.value)}
            onFocus={ensureTeams}
            onClick={ensureTeams}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 240 }}
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
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 240 }}
          >
            <option value="">Гости…</option>
            {(teams ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

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

        {msg ? <div style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div> : null}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Матчи создаются через <b>/api/admin/matches</b> (service role), поэтому RLS не блокирует.
        </div>
      </div>
    </form>
  );
}
