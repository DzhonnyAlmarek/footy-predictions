"use client";

import { useEffect, useState } from "react";

type Props = {
  matchId: number;
  homePred: number | null;
  awayPred: number | null;
  canEdit: boolean;
};

export default function PredCellEditable({ matchId, homePred, awayPred, canEdit }: Props) {
  const [h, setH] = useState(homePred == null ? "" : String(homePred));
  const [a, setA] = useState(awayPred == null ? "" : String(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setH(homePred == null ? "" : String(homePred));
  }, [homePred]);

  useEffect(() => {
    setA(awayPred == null ? "" : String(awayPred));
  }, [awayPred]);

  async function save() {
    if (!canEdit) return;

    setError(null);

    const hh = h.trim();
    const aa = a.trim();

    // разрешаем пусто-пусто (не сохраняем)
    if (hh === "" && aa === "") return;

    const home = hh === "" ? null : Number(hh);
    const away = aa === "" ? null : Number(aa);

    if (home === null || away === null) {
      setError("Введите оба значения (например 1 и 0)");
      return;
    }
    if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away) || away < 0) {
      setError("Только целые числа 0+");
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
          home_pred: home,
          away_pred: away,
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
    return (
      <span style={{ fontFamily: "monospace" }}>
        {homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`}
      </span>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        value={h}
        onChange={(e) => setH(e.target.value)}
        onBlur={save}
        inputMode="numeric"
        placeholder="0"
        disabled={saving}
        style={{
          width: 44,
          padding: "6px 8px",
          borderRadius: 10,
          border: "1px solid #ddd",
          fontSize: 13,
          textAlign: "center",
        }}
      />
      <span style={{ fontWeight: 900, opacity: 0.7 }}>:</span>
      <input
        value={a}
        onChange={(e) => setA(e.target.value)}
        onBlur={save}
        inputMode="numeric"
        placeholder="0"
        disabled={saving}
        style={{
          width: 44,
          padding: "6px 8px",
          borderRadius: 10,
          border: "1px solid #ddd",
          fontSize: 13,
          textAlign: "center",
        }}
      />

      {saving ? <span style={{ opacity: 0.6 }}>…</span> : null}
      {error ? <span style={{ marginLeft: 6, color: "crimson", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
