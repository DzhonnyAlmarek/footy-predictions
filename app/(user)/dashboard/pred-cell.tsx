"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [h, setH] = useState<string>(homePred == null ? "" : String(homePred));
  const [a, setA] = useState<string>(awayPred == null ? "" : String(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setH(homePred == null ? "" : String(homePred));
  }, [homePred]);

  useEffect(() => {
    setA(awayPred == null ? "" : String(awayPred));
  }, [awayPred]);

  const valueOk = useMemo(() => {
    // пустые считаем “нет прогноза”
    if (h.trim() === "" && a.trim() === "") return true;
    // оба должны быть числами
    if (!/^\d+$/.test(h.trim())) return false;
    if (!/^\d+$/.test(a.trim())) return false;
    return true;
  }, [h, a]);

  async function save() {
    if (!canEdit) return;
    setError(null);

    if (!valueOk) {
      setError("Только числа");
      return;
    }

    // если оба пустые — не сохраняем (можно сделать “очистить” отдельно)
    if (h.trim() === "" && a.trim() === "") return;

    setSaving(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          match_id: matchId,
          home_pred: Number(h.trim()),
          away_pred: Number(a.trim()),
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
    const text =
      homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`;
    return <div style={{ minHeight: 26, fontFamily: "monospace" }}>{text}</div>;
  }

  return (
    <div style={{ minHeight: 26, display: "inline-flex", flexDirection: "column" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          inputMode="numeric"
          value={h}
          onChange={(e) => setH(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={save}
          disabled={saving}
          placeholder="0"
          style={{
            width: 44,
            padding: "4px 6px",
            borderRadius: 10,
            border: "1px solid #d6d6d6",
            fontSize: 13,
            textAlign: "center",
          }}
        />
        <span style={{ opacity: 0.6, fontWeight: 900 }}>:</span>
        <input
          inputMode="numeric"
          value={a}
          onChange={(e) => setA(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={save}
          disabled={saving}
          placeholder="0"
          style={{
            width: 44,
            padding: "4px 6px",
            borderRadius: 10,
            border: "1px solid #d6d6d6",
            fontSize: 13,
            textAlign: "center",
          }}
        />
        {saving ? <span style={{ marginLeft: 6, opacity: 0.6 }}>…</span> : null}
      </div>

      {error ? (
        <div style={{ marginTop: 4, color: "crimson", fontSize: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
