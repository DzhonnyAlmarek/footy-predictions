"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TeamRow = {
  id: number;
  name: string;
};

type MatchRow = {
  id: number;
  kickoff_at: string | null;
  deadline_at: string | null;
  stage_match_no: number | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home: string;
  away: string;
};

type EditableMatch = {
  id: number;
  stage_match_no: string;
  kickoff_at: string;
  deadline_at: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  saving: boolean;
  deleting: boolean;
  msg: string | null;
};

function toDatetimeLocalValueMsk(iso?: string | null): string {
  if (!iso) return "";

  const utc = new Date(iso);
  if (Number.isNaN(utc.getTime())) return "";

  const msk = new Date(
    utc.toLocaleString("sv-SE", { timeZone: "Europe/Moscow" })
  );

  const year = msk.getFullYear();
  const month = String(msk.getMonth() + 1).padStart(2, "0");
  const day = String(msk.getDate()).padStart(2, "0");
  const hour = String(msk.getHours()).padStart(2, "0");
  const minute = String(msk.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

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

  // МСК = UTC+3, значит для хранения в UTC вычитаем 3 часа
  const utc = new Date(Date.UTC(y, m - 1, d, hh - 3, mm));
  return utc.toISOString();
}

function toInitialRow(m: MatchRow): EditableMatch {
  return {
    id: m.id,
    stage_match_no: m.stage_match_no == null ? "" : String(m.stage_match_no),
    kickoff_at: toDatetimeLocalValueMsk(m.kickoff_at),
    deadline_at: toDatetimeLocalValueMsk(m.deadline_at),
    status: m.status ?? "draft",
    home_team_id: m.home_team_id == null ? "" : String(m.home_team_id),
    away_team_id: m.away_team_id == null ? "" : String(m.away_team_id),
    home_score: m.home_score,
    away_score: m.away_score,
    saving: false,
    deleting: false,
    msg: null,
  };
}

export default function TourMatchesEditor({
  stageId,
  tourId,
  teams,
  initialMatches,
}: {
  stageId: number;
  tourId: number;
  teams: TeamRow[];
  initialMatches: MatchRow[];
}) {
  const router = useRouter();

  const [rows, setRows] = useState<EditableMatch[]>(() =>
    initialMatches.map(toInitialRow)
  );

  const teamNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of teams) map.set(t.id, t.name);
    return map;
  }, [teams]);

  function updateRow(id: number, patch: Partial<EditableMatch>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(id: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    const homeId = Number(row.home_team_id);
    const awayId = Number(row.away_team_id);

    if (!Number.isFinite(homeId)) {
      updateRow(id, { msg: "Выберите хозяев" });
      return;
    }
    if (!Number.isFinite(awayId)) {
      updateRow(id, { msg: "Выберите гостей" });
      return;
    }
    if (homeId === awayId) {
      updateRow(id, { msg: "Команды должны быть разными" });
      return;
    }

    updateRow(id, { saving: true, msg: null });

    try {
      const res = await fetch(`/api/admin/matches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour_id: tourId,
          stage_match_no: row.stage_match_no === "" ? null : Number(row.stage_match_no),
          kickoff_at: mskToUtcIso(row.kickoff_at),
          deadline_at: mskToUtcIso(row.deadline_at),
          status: row.status || "draft",
          home_team_id: homeId,
          away_team_id: awayId,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка сохранения (${res.status})`);
      }

      updateRow(id, { saving: false, msg: "Сохранено ✅" });
      router.refresh();
    } catch (e: any) {
      updateRow(id, {
        saving: false,
        msg: e?.message ?? "Ошибка сохранения матча",
      });
    }
  }

  async function deleteRow(id: number) {
    const ok = window.confirm("Удалить этот матч?");
    if (!ok) return;

    updateRow(id, { deleting: true, msg: null });

    try {
      const res = await fetch(`/api/admin/matches/${id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка удаления (${res.status})`);
      }

      setRows((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (e: any) {
      updateRow(id, {
        deleting: false,
        msg: e?.message ?? "Ошибка удаления матча",
      });
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((row) => {
        const homeName = teamNameById.get(Number(row.home_team_id)) ?? "—";
        const awayName = teamNameById.get(Number(row.away_team_id)) ?? "—";
        const res =
          row.home_score == null || row.away_score == null
            ? "—"
            : `${row.home_score}:${row.away_score}`;

        return (
          <div
            key={row.id}
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: 14,
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 900 }}>
                #{row.id} • {homeName} — {awayName}{" "}
                <span style={{ opacity: 0.7 }}>({res})</span>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link href={`/match/${row.id}`} style={{ textDecoration: "underline" }}>
                  открыть
                </Link>

                <Link
                  href={`/admin/stages/${stageId}/tours/${tourId}/matches/${row.id}`}
                  style={{ textDecoration: "underline" }}
                >
                  карточка матча
                </Link>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="number"
                placeholder="№ этапа"
                value={row.stage_match_no}
                onChange={(e) => updateRow(row.id, { stage_match_no: e.target.value, msg: null })}
                disabled={row.saving || row.deleting}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  width: 120,
                }}
              />

              <select
                value={row.home_team_id}
                onChange={(e) => updateRow(row.id, { home_team_id: e.target.value, msg: null })}
                disabled={row.saving || row.deleting}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  minWidth: 220,
                }}
              >
                <option value="">Хозяева…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={row.away_team_id}
                onChange={(e) => updateRow(row.id, { away_team_id: e.target.value, msg: null })}
                disabled={row.saving || row.deleting}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  minWidth: 220,
                }}
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
                <span>Kickoff (МСК)</span>
                <input
                  type="datetime-local"
                  value={row.kickoff_at}
                  onChange={(e) => updateRow(row.id, { kickoff_at: e.target.value, msg: null })}
                  disabled={row.saving || row.deleting}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Deadline (МСК)</span>
                <input
                  type="datetime-local"
                  value={row.deadline_at}
                  onChange={(e) => updateRow(row.id, { deadline_at: e.target.value, msg: null })}
                  disabled={row.saving || row.deleting}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Статус</span>
                <select
                  value={row.status}
                  onChange={(e) => updateRow(row.id, { status: e.target.value, msg: null })}
                  disabled={row.saving || row.deleting}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    minWidth: 180,
                  }}
                >
                  <option value="draft">draft</option>
                  <option value="scheduled">scheduled</option>
                  <option value="live">live</option>
                  <option value="finished">finished</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => saveRow(row.id)}
                disabled={row.saving || row.deleting}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: row.saving || row.deleting ? "not-allowed" : "pointer",
                }}
              >
                {row.saving ? "Сохранение..." : "Сохранить"}
              </button>

              <button
                type="button"
                onClick={() => deleteRow(row.id)}
                disabled={row.saving || row.deleting}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #b91c1c",
                  background: "#fff",
                  color: "#b91c1c",
                  fontWeight: 900,
                  cursor: row.saving || row.deleting ? "not-allowed" : "pointer",
                }}
              >
                {row.deleting ? "Удаление..." : "Удалить"}
              </button>

              {row.msg ? (
                <span
                  style={{
                    fontWeight: 800,
                    color: row.msg.includes("✅") ? "inherit" : "crimson",
                  }}
                >
                  {row.msg}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}