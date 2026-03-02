"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

function toIsoUtcFromLocal(dtLocal: string): string {
  // dtLocal из <input type="datetime-local"> в формате "YYYY-MM-DDTHH:mm"
  // JS интерпретирует это как локальное время браузера и переводит в UTC через toISOString()
  const d = new Date(dtLocal);
  if (Number.isNaN(d.getTime())) throw new Error("Некорректная дата/время");
  return d.toISOString();
}

function addMinutesIso(isoUtc: string, minutes: number): string {
  const d = new Date(isoUtc);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export default function CreateMatchForm(props: { stageId: number; tourId: number }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<Team[] | null>(null);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");

  // ✅ обязательное поле
  const [kickoffLocal, setKickoffLocal] = useState<string>("");

  // опционально: если хочешь ручной дедлайн — можно добавить второй инпут,
  // но пока делаем дедлайн = kickoff - 1 минута
  const DEADLINE_MINUTES_BEFORE = 1;

  async function ensureTeams() {
    if (teams) return;
    const { data, error } = await supabase.from("teams").select("id,name").order("name", { ascending: true });
    if (error) return setMsg(error.message);
    setTeams(data ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const sId = Number(props.stageId);
    const tId = Number(props.tourId);
    const hId = Number(homeTeamId);
    const aId = Number(awayTeamId);

    if (!Number.isFinite(hId)) return setMsg("Выберите хозяев");
    if (!Number.isFinite(aId)) return setMsg("Выберите гостей");
    if (hId === aId) return setMsg("Команды должны быть разными");

    if (!kickoffLocal.trim()) return setMsg("Укажите дату и время начала матча");

    let kickoff_at: string;
    let deadline_at: string;
    try {
      kickoff_at = toIsoUtcFromLocal(kickoffLocal);
      // дедлайн = kickoff - 1 мин
      deadline_at = addMinutesIso(kickoff_at, -DEADLINE_MINUTES_BEFORE);
    } catch (err: any) {
      return setMsg(err?.message ?? "Некорректная дата/время");
    }

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
          kickoff_at,
          deadline_at,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        const m = json?.message ? ` — ${json.message}` : "";
        const d = json?.details ? ` (${json.details})` : "";
        throw new Error(`${json?.error ?? `Ошибка создания матча (${res.status})`}${m}${d}`);
      }

      setHomeTeamId("");
      setAwayTeamId("");
      // kickoff оставляем (часто добавляют пачкой матчей в один день)
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
      <div style={{ fontWeight: 900 }}>Добавить матч в этот тур</div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
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
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Начало матча</span>
            <input
              type="datetime-local"
              value={kickoffLocal}
              onChange={(e) => setKickoffLocal(e.target.value)}
              disabled={loading}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 240 }}
            />
          </label>

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
              height: 42,
              alignSelf: "end",
            }}
          >
            {loading ? "Создание..." : "Добавить"}
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Дедлайн автоматически = начало − {DEADLINE_MINUTES_BEFORE} мин.
        </div>

        {msg ? <div style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div> : null}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Этап #{props.stageId} • Тур #{props.tourId}
        </div>
      </div>
    </form>
  );
}