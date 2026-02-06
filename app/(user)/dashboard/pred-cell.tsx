"use client";

import { useEffect, useState } from "react";

type Props = {
  matchId: number;
  homePred: number | null;
  awayPred: number | null;
  canEdit: boolean;
};

export default function PredCellEditable({
  matchId,
  homePred,
  awayPred,
  canEdit,
}: Props) {
  const [value, setValue] = useState(
    homePred != null && awayPred != null ? `${homePred}:${awayPred}` : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(homePred != null && awayPred != null ? `${homePred}:${awayPred}` : "");
  }, [homePred, awayPred]);

  async function save() {
    if (!canEdit) return;
    setError(null);

    const m = value.trim().match(/^(\d+):(\d+)$/);
    if (!m) {
      setError("Формат: 1:0");
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
          home_pred: Number(m[1]),
          away_pred: Number(m[2]),
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
    return <span>{value || <span style={{ opacity: 0.4 }}>—</span>}</span>;
  }

  return (
    <div style={{ minHeight: 28 }}>
      <input
        className="predInput"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={saving}
        placeholder="1:0"
      />
      {saving && <span style={{ marginLeft: 6, opacity: 0.6 }}>…</span>}
      {error && (
        <div style={{ color: "crimson", fontSize: 12, marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
