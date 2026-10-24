"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Team = { id: number; name: string };
type Tour = { id: number; tour_no: number; name: string | null };

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  // Отображаем фиксированное московское время (UTC+3), независимо от браузера.
  const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  const year = msk.getUTCFullYear();
  const month = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const day = String(msk.getUTCDate()).padStart(2, "0");
  const hour = String(msk.getUTCHours()).padStart(2, "0");
  const minute = String(msk.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function mskToUtcIso(local: string): string | null {
  if (!local) return null;
  const [date, time] = local.split("T");
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm)).toISOString();
}

export default function EditMatchForm({
  stageId,
  tourId,
  matchId,
  teams,
  tours,
  initialTourId,
  initialStageMatchNo,
  initialKickoffAt,
  initialDeadlineAt,
  initialStatus,
  initialHomeTeamId,
  initialAwayTeamId,
}: {
  stageId: number;
  tourId: number;
  matchId: number;
  teams: Team[];
  tours: Tour[];
  initialTourId: number;
  initialStageMatchNo: number | null;
  initialKickoffAt: string;
  initialDeadlineAt: string;
  initialStatus: string;
  initialHomeTeamId: number;
  initialAwayTeamId: number;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [nextTourId, setNextTourId] = useState(
    Number.isFinite(initialTourId) ? String(initialTourId) : String(tourId)
  );
  const [stageMatchNo, setStageMatchNo] = useState(
    initialStageMatchNo == null ? "" : String(initialStageMatchNo)
  );
  const [kickoffAt, setKickoffAt] = useState(toDatetimeLocalValue(initialKickoffAt));
  const [deadlineAt, setDeadlineAt] = useState(toDatetimeLocalValue(initialDeadlineAt));
  const [status, setStatus] = useState(initialStatus || "draft");
  const [homeTeamId, setHomeTeamId] = useState(
    Number.isFinite(initialHomeTeamId) ? String(initialHomeTeamId) : ""
  );
  const [awayTeamId, setAwayTeamId] = useState(
    Number.isFinite(initialAwayTeamId) ? String(initialAwayTeamId) : ""
  );

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const hId = Number(homeTeamId);
    const aId = Number(awayTeamId);
    const tId = Number(nextTourId);

    if (!Number.isFinite(tId)) return setMsg("Выберите тур");
    if (!Number.isFinite(hId)) return setMsg("Выберите хозяев");
    if (!Number.isFinite(aId)) return setMsg("Выберите гостей");
    if (hId === aId) return setMsg("Команды должны быть разными");

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour_id: tId,
          stage_match_no: stageMatchNo === "" ? null : Number(stageMatchNo),
          kickoff_at: mskToUtcIso(kickoffAt),
          deadline_at: mskToUtcIso(deadlineAt),
          status,
          home_team_id: hId,
          away_team_id: aId,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка обновления матча (${res.status})`);
      }

      setMsg("Матч сохранён ✅");
      router.push(`/admin/stages/${stageId}/tours/${tId}/matches`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка обновления матча");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    const ok = window.confirm("Удалить этот матч?");
    if (!ok) return;

    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/admin/matches/${matchId}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка удаления матча (${res.status})`);
      }

      router.push(`/admin/stages/${stageId}/tours/${tourId}/matches`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления матча");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            value={nextTourId}
            onChange={(e) => setNextTourId(e.target.value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
          >
            {tours.map((t) => (
              <option key={t.id} value={t.id}>
                Тур {t.tour_no}{t.name ? ` — ${t.name}` : ""}
              </option>
            ))}
          </select>

          <input
            type="number"
            value={stageMatchNo}
            onChange={(e) => setStageMatchNo(e.target.value)}
            placeholder="№ матча этапа"
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 180 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select
            value={homeTeamId}
            onChange={(e) => setHomeTeamId(e.target.value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 240 }}
          >
            <option value="">Хозяева…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={awayTeamId}
            onChange={(e) => setAwayTeamId(e.target.value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 240 }}
          >
            <option value="">Гости…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Начало матча (МСК)</span>
            <input
              type="datetime-local"
              lang="ru-RU"
              value={kickoffAt}
              onChange={(e) => setKickoffAt(e.target.value)}
              disabled={loading}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Приём прогнозов до (МСК)</span>
            <input
              type="datetime-local"
              lang="ru-RU"
              value={deadlineAt}
              onChange={(e) => setDeadlineAt(e.target.value)}
              disabled={loading}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Статус</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={loading}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 180 }}
            >
              <option value="draft">draft</option>
              <option value="scheduled">scheduled</option>
              <option value="live">live</option>
              <option value="finished">finished</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Сохранение..." : "Сохранить матч"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #b91c1c",
              background: "#fff",
              color: "#b91c1c",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Удалить матч
          </button>
        </div>

        {msg ? (
          <div style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>
            {msg}
          </div>
        ) : null}
      </div>
    </form>
  );
}