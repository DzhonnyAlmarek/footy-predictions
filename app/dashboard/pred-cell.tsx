"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  matchId: number;
  homePred: number | null;
  awayPred: number | null;
  canEdit: boolean;
  pointsText?: string;
  tip?: string;
};

function toNum(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

export default function PredCellEditable({
  matchId,
  homePred,
  awayPred,
  canEdit,
  pointsText,
  tip,
}: Props) {
  const [h, setH] = useState(homePred == null ? "" : String(homePred));
  const [a, setA] = useState(awayPred == null ? "" : String(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hRef = useRef<HTMLInputElement | null>(null);
  const aRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setH(homePred == null ? "" : String(homePred));
  }, [homePred]);

  useEffect(() => {
    setA(awayPred == null ? "" : String(awayPred));
  }, [awayPred]);

  async function save(nextH?: string, nextA?: string) {
    if (!canEdit) return;

    const hh = toNum(nextH ?? h);
    const aa = toNum(nextA ?? a);

    // пустое допускаем, но не сохраняем
    if (hh == null || aa == null) {
      setError(null);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          home_pred: hh,
          away_pred: aa,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Ошибка сохранения");
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  // просмотр
  if (!canEdit) {
    const text =
      homePred == null || awayPred == null ? "" : `${homePred}:${awayPred}`;

    return (
      <div title={tip} style={{ minHeight: 24 }}>
        {text || <span style={{ opacity: 0.4 }}>—</span>}
        {pointsText && <span style={{ opacity: 0.75 }}> {pointsText}</span>}
      </div>
    );
  }

  const hasBoth = toNum(h) != null && toNum(a) != null;

  return (
    <div title={tip} style={{ minHeight: 26 }}>
      <div
        className={
          "predInputWrap " + (error ? "predError" : hasBoth ? "predOk" : "")
        }
      >
        <input
          ref={hRef}
          value={h}
          inputMode="numeric"
          onChange={(e) => setH(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              aRef.current?.focus();
            }
          }}
          onBlur={() => save()}
          disabled={saving}
          placeholder="0"
          className="predInput"
        />
        <span className="predColon">:</span>
        <input
          ref={aRef}
          value={a}
          inputMode="numeric"
          onChange={(e) => setA(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
              aRef.current?.blur();
            }
          }}
          onBlur={() => save()}
          disabled={saving}
          placeholder="0"
          className="predInput"
        />
        {saving && <span className="predSaving">…</span>}
      </div>

      {error && <div className="predErrText">{error}</div>}
    </div>
  );
}
