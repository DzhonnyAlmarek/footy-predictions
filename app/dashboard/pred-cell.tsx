"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  matchId: number;
  pred: string; // "2:1" или ""
  canEdit: boolean;
  pointsText?: string; // например " (2.5)"
  tip?: string;
};

function parsePred(v: string) {
  const s = String(v ?? "").trim();
  if (!s) return { home: "", away: "" };

  const m = s.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m) return { home: "", away: "" };
  return { home: m[1], away: m[2] };
}

export default function PredCellEditable({ matchId, pred, canEdit, pointsText, tip }: Props) {
  const initial = useMemo(() => parsePred(pred), [pred]);

  const [home, setHome] = useState(initial.home);
  const [away, setAway] = useState(initial.away);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // если pred поменялся извне — синхронизируем
  useEffect(() => {
    const p = parsePred(pred);
    setHome(p.home);
    setAway(p.away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pred]);

  async function save() {
    setMsg(null);
    if (!canEdit) return;

    const h = home.trim();
    const a = away.trim();

    const homePred = h === "" ? null : Number(h);
    const awayPred = a === "" ? null : Number(a);

    if (homePred !== null && (!Number.isFinite(homePred) || homePred < 0)) return setMsg("Некорректно");
    if (awayPred !== null && (!Number.isFinite(awayPred) || awayPred < 0)) return setMsg("Некорректно");

    setSaving(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          home_pred: homePred,
          away_pred: awayPred,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error === "not_auth" ? "Нужен вход" : (json?.error ?? `Ошибка (${res.status})`));
      }

      setMsg("✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 1200);
    }
  }

  const cellStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  };

  const inputStyle: React.CSSProperties = {
    width: 46,
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid #ddd",
    fontWeight: 800,
  };

  return (
    <div style={cellStyle} title={tip}>
      {canEdit ? (
        <>
          <input
            value={home}
            onChange={(e) => setHome(e.target.value)}
            inputMode="numeric"
            disabled={saving}
            style={inputStyle}
          />
          <span style={{ fontWeight: 900 }}>:</span>
          <input
            value={away}
            onChange={(e) => setAway(e.target.value)}
            inputMode="numeric"
            disabled={saving}
            style={inputStyle}
          />

          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "..." : "OK"}
          </button>

          {pointsText ? <span style={{ opacity: 0.85 }}>{pointsText}</span> : null}
          {msg ? <span style={{ opacity: 0.85 }}>{msg}</span> : null}
        </>
      ) : (
        <>
          <span style={{ fontWeight: 900 }}>{pred}</span>
          {pointsText ? <span style={{ opacity: 0.85 }}>{pointsText}</span> : null}
        </>
      )}
    </div>
  );
}
