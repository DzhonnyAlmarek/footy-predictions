"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function mskToUtcIso(local: string | null): string | null {
  if (!local) return null;

  const [date, time] = local.split("T");
  if (!date || !time) return null;

  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);

  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mm)
  ) {
    return null;
  }

  // МСК = UTC+3 → для хранения в UTC вычитаем 3 часа
  const utc = new Date(Date.UTC(y, m - 1, d, hh - 3, mm));
  return utc.toISOString();
}

function minusOneMinute(local: string): string {
  if (!local) return "";

  const [date, time] = local.split("T");
  if (!date || !time) return "";

  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);

  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mm)
  ) {
    return "";
  }

  const dt = new Date(y, m - 1, d, hh, mm);
  dt.setMinutes(dt.getMinutes() - 1);

  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  const hour = String(dt.getHours()).padStart(2, "0");
  const minute = String(dt.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default function CreateMatchForm({
  stageId,
  tourId,
}: {
  stageId: number;
  tourId: number;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [kickoffAt, setKickoffAt] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [autoDeadline, setAutoDeadline] = useState(true);

  const [teams, setTeams] = useState<Array<{ id: number; name: string }> | null>(null);

  async function ensureTeams() {
    if (teams) return;

    try {
      const res = await fetch("/api/admin/teams-lite", { method: "GET" });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (Array.isArray(json?.teams)) {
          setTeams(json.teams);
          return;
        }
      }
    } catch {}

    setMsg("Не удалось загрузить команды");
  }

  function onKickoffChange(v: string) {
    setKickoffAt(v);

    if (autoDeadline) {
      setDeadlineAt(v ? minusOneMinute(v) : "");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const hId = Number(homeTeamId);
    const aId = Number(awayTeamId);

    if (!Number.isFinite(stageId)) return setMsg("Некорректный этап");
    if (!Number.isFinite(tourId)) return setMsg("Некорректный тур");
    if (!Number.isFinite(hId)) return setMsg("Выберите хозяев");
    if (!Number.isFinite(aId)) return setMsg("Выберите гостей");
    if (hId === aId) return setMsg("Команды должны быть разными");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          tour_id: tourId,
          home_team_id: hId,
          away_team_id: aId,
          kickoff_at: mskToUtcIso(kickoffAt),
          deadline_at: mskToUtcIso(deadlineAt),
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
      setKickoffAt("");
      setDeadlineAt("");
      setMsg(`Матч создан ✅ (№ ${json?.stage_match_no ?? "?"})`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка создания матча");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}
    >
      <div style={{ fontWeight: 900 }}>Создать матч</div>

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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Kickoff (МСК)</span>
            <input
              type="datetime-local"
              value={kickoffAt}
              onChange={(e) => onKickoffChange(e.target.value)}
              disabled={loading}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Deadline (МСК)</span>
            <input
              type="datetime-local"
              value={deadlineAt}
              onChange={(e) => {
                setAutoDeadline(false);
                setDeadlineAt(e.target.value);
              }}
              disabled={loading}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingBottom: 10,
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={autoDeadline}
              onChange={(e) => setAutoDeadline(e.target.checked)}
              disabled={loading}
            />
            <span>Дедлайн = kickoff − 1 минута</span>
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
            }}
          >
            {loading ? "Создание..." : "Добавить"}
          </button>
        </div>

        {msg ? (
          <div style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>
            {msg}
          </div>
        ) : null}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Время в форме вводится в <b>МСК</b>, в базе сохраняется в <b>UTC</b>.
        </div>
      </div>
    </form>
  );
}