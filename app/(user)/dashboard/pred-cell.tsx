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

function toStr(v: number | null) {
  return v == null ? "" : String(v);
}

export default function PredCellEditable({
  matchId,
  homePred,
  awayPred,
  canEdit,
  pointsText,
  tip,
}: Props) {
  const [h, setH] = useState(toStr(homePred));
  const [a, setA] = useState(toStr(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hRef = useRef<HTMLInputElement | null>(null);
  const aRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setH(toStr(homePred)), [homePred]);
  useEffect(() => setA(toStr(awayPred)), [awayPred]);

  function normInt(s: string) {
    const t = s.trim();
    if (t === "") return null;
    if (!/^\d+$/.test(t)) return NaN;
    return Number(t);
  }

  async function save() {
    if (!canEdit) return;

    setError(null);

    const hh = normInt(h);
    const aa = normInt(a);

    // если оба пустые — просто не сохраняем (и не ругаемся)
    if (hh === null && aa === null) return;

    if (hh === null || aa === null || Number.isNaN(hh) || Number.isNaN(aa)) {
      setError("Введите два числа");
      return;
    }

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
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Ошибка сохранения");
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    const show = homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`;
    return (
      <div title={tip} style={{ minHeight: 24, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: "monospace" }}>{show}</span>
        {pointsText ? <span style={{ opacity: 0.75 }}> {pointsText}</span> : null}
      </div>
    );
  }

  return (
    <div title={tip} className="pred2Wrap">
      <div className="pred2Inputs">
        <input
          ref={hRef}
          value={h}
          onChange={(e) => setH(e.target.value)}
          onBlur={save}
          disabled={saving}
          inputMode="numeric"
          placeholder="0"
          className="pred2Input"
        />
        <span className="pred2Sep">:</span>
        <input
          ref={aRef}
          value={a}
          onChange={(e) => setA(e.target.value)}
          onBlur={save}
          disabled={saving}
          inputMode="numeric"
          placeholder="0"
          className="pred2Input"
        />
        {saving ? <span className="pred2Saving">…</span> : null}
      </div>

      {error ? <div className="pred2Err">{error}</div> : null}
    </div>
  );
}
