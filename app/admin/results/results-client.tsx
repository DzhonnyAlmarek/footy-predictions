"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type MatchVM = {
  id: number;
  stage_match_no: number | null;
  kickoff_at: string | null; // остаётся в типе, но UI колонки нет
  kickoff_msk: string;       // остаётся в типе, но UI колонки нет
  status: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
  home_penalty_goals: number;
  away_penalty_goals: number;
};

type SaveResp =
  | { ok: true }
  | { ok: false; error: string; message?: string };

function clampScore(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const nn = Math.max(0, Math.min(99, Math.trunc(n)));
  return nn;
}

export default function ResultsClient(props: { initialMatches: MatchVM[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<MatchVM[]>(props.initialMatches);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function saveMatch(
    matchId: number,
    patch: Partial<Pick<MatchVM, "home_score" | "away_score" | "home_penalty_goals" | "away_penalty_goals">>
  ) {
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
      router.refresh();
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
        <table className="table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th style={{ width: 70, textAlign: "center" as const }}>№</th>
              <th>Матч</th>
              <th style={{ width: 170, textAlign: "center" as const }}>Счёт</th>
          <th style={{ width: 170, textAlign: "center" as const }}>Пенальти</th>
          <th style={{ width: 150, textAlign: "center" as const }}>Действия</th>
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
  onSave: (patch: Partial<Pick<MatchVM, "home_score" | "away_score" | "home_penalty_goals" | "away_penalty_goals">>) => void;
}) {
  const { row, saving, onChange, onSave } = props;

  const [draftHome, setDraftHome] = useState<string>(
    row.home_score == null ? "" : String(row.home_score)
  );
  const [draftAway, setDraftAway] = useState<string>(
    row.away_score == null ? "" : String(row.away_score)
  );
  const [draftHomePen, setDraftHomePen] = useState(String(row.home_penalty_goals ?? 0));
  const [draftAwayPen, setDraftAwayPen] = useState(String(row.away_penalty_goals ?? 0));

  function commitScores() {
    const hs = clampScore(draftHome);
    const as = clampScore(draftAway);
    const hp = clampScore(draftHomePen) ?? 0;
    const ap = clampScore(draftAwayPen) ?? 0;
    onChange({ ...row, home_score: hs, away_score: as, home_penalty_goals: hp, away_penalty_goals: ap });
    onSave({ home_score: hs, away_score: as, home_penalty_goals: hp, away_penalty_goals: ap });
  }

  return (
    <tr>
      <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>
        <span className="badge isNeutral">{row.stage_match_no ?? row.id}</span>
      </td>

      <td>
        <div style={{ fontWeight: 950 }}>
          {row.home} <span style={{ opacity: 0.6 }}>—</span> {row.away}
        </div>
        <div style={{ marginTop: 6, opacity: 0.7, fontWeight: 800, fontSize: 12 }}>
          Статус: <b>{row.status || "—"}</b>
        </div>
      </td>

      <td style={{ textAlign: "center" }}>
        <div className="resultInputs" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
            disabled={saving}
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
            disabled={saving}
          />
        </div>
      </td>

      <td style={{ textAlign: "center" }}>
        <div className="resultInputs" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input className="scoreInput" inputMode="numeric" value={draftHomePen}
            onChange={(e) => setDraftHomePen(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            title="Голы хозяев с пенальти" disabled={saving} />
          <span className="scoreSep">:</span>
          <input className="scoreInput" inputMode="numeric" value={draftAwayPen}
            onChange={(e) => setDraftAwayPen(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            title="Голы гостей с пенальти" disabled={saving} />
        </div>
      </td>

      <td style={{ textAlign: "center" }}>
        <button className="btn btnPrimary" onClick={commitScores} disabled={saving} title="Сохранить счёт">
          {saving ? "⏳" : "💾"} Счёт
        </button>
      </td>
    </tr>
  );
}
