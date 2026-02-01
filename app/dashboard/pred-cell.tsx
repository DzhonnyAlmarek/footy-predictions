"use client";

import { useEffect, useState } from "react";

type Props = {
  matchId: number;
  pred: string;
  canEdit: boolean;
  pointsText?: string;
  tip?: string;
};

export default function PredCellEditable({
  matchId,
  pred,
  canEdit,
  pointsText,
  tip,
}: Props) {
  const [value, setValue] = useState(pred ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(pred ?? "");
  }, [pred]);

  async function save() {
    if (!canEdit) return;
    setError(null);

    const m = value.trim().match(/^(\d+):(\d+)$/);
    if (!m) {
      setError("Формат прогноза: 1:0");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        credentials: "include", // 🔴 КРИТИЧНО ДЛЯ ПРОДА
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          home_pred: Number(m[1]),
          away_pred: Number(m[2]),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Ошибка сохранения");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  // 🟢 РЕЖИМ ПРОСМОТРА
  if (!canEdit) {
    return (
      <div title={tip} style={{ minHeight: 24 }}>
        {pred || <span style={{ opacity: 0.4 }}>—</span>}
        {pointsText && <span style={{ opacity: 0.75 }}> {pointsText}</span>}
      </div>
    );
  }

  // ✏️ РЕЖИМ ВВОДА
  return (
    <div style={{ minHeight: 26 }} title={tip}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={saving}
        placeholder="1:0"
        style={{
          width: 56,
          padding: "2px 4px",
          borderRadius: 6,
          border: "1px solid #ccc",
          fontSize: 13,
        }}
      />
      {saving && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
      {error && (
        <div style={{ color: "crimson", fontSize: 12, marginTop: 2 }}>
          {error}
        </div>
      )}
    </div>
  );
}
