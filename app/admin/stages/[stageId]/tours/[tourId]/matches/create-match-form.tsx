"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: number; name: string };

const TZ_MSK = "Europe/Moscow";

/** "YYYY-MM-DDTHH:mm" in MSK -> ISO UTC string */
function mskLocalValueToIsoUtc(v: string) {
  const s = String(v || "").trim();
  if (!s) return null;

  const withOffset = `${s}:00+03:00`; // MSK
  const d = new Date(withOffset);
  if (!Number.isFinite(d.getTime())) return null;

  return d.toISOString();
}

export default function CreateMatchForm({ stageId, tourId }: { stageId: number; tourId: number }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [teams, setTeams] = useState<Team[] | null>(null);
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");

  const [kickoffLocal, setKickoffLocal] = useState<string>(""); // datetime-local (МСК)
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

    const kickoffIso = mskLocalValueToIsoUtc(kickoffLocal);
    if (!kickoffIso) return setMsg("Укажите дату и время начала (МСК)");

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
          kickoff_at: kickoffIso,
          // deadline_at можно не задавать — уведомления/логика идут по kickoff_at
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

        <div style={{ display: "grid", gap: 4 }}>
          <input
            type="datetime-local"
            value={kickoffLocal}
            onChange={(e) => setKickoffLocal(e.target.value)}
            onInput={(e) => setKickoffLocal((e.target as HTMLInputElement).value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            title="Дата и время начала матча (МСК)"
          />
        </div>

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
        <div style={{ marginTop: 10, fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Время вводится в <b>МСК</b> и сохраняется на сервер в UTC автоматически.
      </div>
    </form>
  );
}