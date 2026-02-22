"use client";

import { useMemo, useState } from "react";

type MatchVM = {
  id: number;
  stage_match_no: number | null;
  kickoff_at: string | null;     // ISO
  kickoff_msk: string;           // pretty
  status: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
};

type SaveResp =
  | { ok: true }
  | { ok: false; error: string; message?: string };

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local ожидает YYYY-MM-DDTHH:MM (без Z)
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localInputToIso(v: string): string | null {
  // "" => null
  if (!v) return null;
  // "2026-02-22T19:45" => Date local -> ISO
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function clampScore(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const nn = Math.max(0, Math.min(99, Math.trunc(n)));
  return nn;
}

export default function ResultsClient(props: { initialMatches: MatchVM[] }) {
  const [rows, setRows] = useState<MatchVM[]>(props.initialMatches);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function saveMatch(matchId: number, patch: Partial<Pick<MatchVM, "home_score" | "away_score" | "kickoff_at">>) {
    setSavingId(matchId);
    setMsg("");

    try {
      const res = await fetch("/api/admin/matches/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, ...patch }),
      });

      const json = (await res.json()) as SaveResp;
      if (!json.ok) throw new Error(json.message ?? json.error);

      setMsg(`✅ Сохранено (матч #${matchId})`);
    } catch (e: any) {
      setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setSavingId(null);
    }
  }

  const table = useMemo(() => rows, [rows]);

  return (
    <section style={{ marginTop: 14 }}>
      {msg ? (
        <div className="resultsMsg" style={{ whiteSpace: "pre-wrap" }}>
          {msg}
        </div>
      ) : null}

      <div className="tableWrap">
        <table className="table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>№</th>
              <th style={{ width: 260 }}>Начало</th>
              <th>Матч</th>
              <th style={{ width: 170, textAlign: "center" as any }}>Счёт</th>
              <th style={{ width: 150, textAlign: "center" as any }}>Действия</th>
            </tr>
          </thead>

          <tbody>
            {table.map((m) => (
              <RowEditor
                key={m.id}
                row={m}
                saving={savingId === m.id}
                onChange={(next) => {
                  setRows((prev) => prev.map((x) => (x.id === m.id ? next : x)));
                }}
                onSave={(patch) => saveMatch(m.id, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowEditor(props: {
  row: MatchVM;
  saving: boolean;
  onChange: (next: MatchVM) => void;
  onSave: (patch: Partial<Pick<MatchVM, "home_score" | "away_score" | "kickoff_at">>) => void;
}) {
  const { row, saving, onChange, onSave } = props;

  const [draftKickoff, setDraftKickoff] = useState<string>(toLocalInputValue(row.kickoff_at));
  const [dirtyKickoff, setDirtyKickoff] = useState(false);

  const [draftHome, setDraftHome] = useState<string>(row.home_score == null ? "" : String(row.home_score));
  const [draftAway, setDraftAway] = useState<string>(row.away_score == null ? "" : String(row.away_score));

  const kickoffIso = localInputToIso(draftKickoff);

  function commitKickoffIfValid() {
    // ✅ не сохраняем при каждом вводе; сохраняем только если:
    // - значение валидно
    // - было изменено
    if (!dirtyKickoff) return;
    if (!kickoffIso) return;
    onChange({ ...row, kickoff_at: kickoffIso, kickoff_msk: row.kickoff_msk });
    onSave({ kickoff_at: kickoffIso });
    setDirtyKickoff(false);
  }

  function commitScores() {
    const hs = clampScore(draftHome);
    const as = clampScore(draftAway);
    onChange({ ...row, home_score: hs, away_score: as });
    onSave({ home_score: hs, away_score: as });
  }

  return (
    <tr>
      <td style={{ whiteSpace: "nowrap" }}>
        <span className="badge isNeutral">
          {row.stage_match_no ?? row.id}
        </span>
      </td>

      <td style={{ whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 900 }}>{row.kickoff_msk}</div>

        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="dtInput"
            type="datetime-local"
            value={draftKickoff}
            onChange={(e) => {
              setDraftKickoff(e.target.value);
              setDirtyKickoff(true);
            }}
            onBlur={() => {
              // ✅ сохранить, когда ушёл с поля
              commitKickoffIfValid();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLInputElement).blur(); // вызовет commit
              }
            }}
            title="Редактирование времени: сохранение по Enter или при уходе с поля (не по каждой цифре)."
          />

          <button
            className="btn"
            onClick={() => commitKickoffIfValid()}
            disabled={saving || !dirtyKickoff || !kickoffIso}
            title="Сохранить время начала"
          >
            💾 Время
          </button>
        </div>

        <div style={{ marginTop: 6, opacity: 0.7, fontWeight: 800, fontSize: 12 }}>
          Статус: <b>{row.status || "—"}</b>
        </div>
      </td>

      <td>
        <div style={{ fontWeight: 950 }}>
          {row.home} <span style={{ opacity: 0.6 }}>—</span> {row.away}
        </div>
      </td>

      <td style={{ textAlign: "center" as any }}>
        <div className="scoreInputs" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            className="scoreInput"
            inputMode="numeric"
            value={draftHome}
            onChange={(e) => setDraftHome(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitScores();
              }
            }}
            title="Счёт хозяев"
          />
          <span className="scoreSep">:</span>
          <input
            className="scoreInput"
            inputMode="numeric"
            value={draftAway}
            onChange={(e) => setDraftAway(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitScores();
              }
            }}
            title="Счёт гостей"
          />
        </div>
      </td>

      <td style={{ textAlign: "center" as any }}>
        <button className="btn btnPrimary" onClick={commitScores} disabled={saving} title="Сохранить счёт">
          {saving ? "⏳" : "💾"} Счёт
        </button>
      </td>
    </tr>
  );
}