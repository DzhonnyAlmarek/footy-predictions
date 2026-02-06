"use client";

import { useEffect, useState } from "react";

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
  const [h, setH] = useState<string>(toStr(homePred));
  const [a, setA] = useState<string>(toStr(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setH(toStr(homePred)), [homePred]);
  useEffect(() => setA(toStr(awayPred)), [awayPred]);

  function parseGoal(s: string): number | null {
    const t = s.trim();
    if (t === "") return null;
    if (!/^\d+$/.test(t)) return NaN;
    return Number(t);
  }

  async function save() {
    if (!canEdit) return;
    setError(null);

    const ph = parseGoal(h);
    const pa = parseGoal(a);

    if (Number.isNaN(ph) || Number.isNaN(pa)) {
      setError("Только цифры");
      return;
    }

    // если один заполнен, а второй пуст — считаем это ошибкой ввода
    if ((ph == null) !== (pa == null)) {
      setError("Заполни оба поля");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          match_id: matchId,
          home_pred: ph,
          away_pred: pa,
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

  if (!canEdit) {
    const shown =
      homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`;
    return (
      <div title={tip} style={{ minHeight: 24, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: "monospace" }}>{shown}</span>
        {pointsText && <span style={{ opacity: 0.75 }}> {pointsText}</span>}
      </div>
    );
  }

  return (
    <div title={tip} style={{ minHeight: 26 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          value={h}
          onChange={(e) => setH(e.target.value)}
          onBlur={save}
          disabled={saving}
          inputMode="numeric"
          placeholder="0"
          style={{
            width: 44,
            padding: "2px 6px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.22)",
            fontSize: 13,
            textAlign: "center",
          }}
        />
        <span style={{ opacity: 0.7, fontWeight: 800 }}>:</span>
        <input
          value={a}
          onChange={(e) => setA(e.target.value)}
          onBlur={save}
          disabled={saving}
          inputMode="numeric"
          placeholder="0"
          style={{
            width: 44,
            padding: "2px 6px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.22)",
            fontSize: 13,
            textAlign: "center",
          }}
        />
        {saving && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
      </div>

      {error && (
        <div style={{ color: "crimson", fontSize: 12, marginTop: 2 }}>
          {error}
        </div>
      )}
    </div>
  );
}
