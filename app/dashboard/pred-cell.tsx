"use client";

import { useEffect, useState } from "react";

type Props = {
  matchId: number;

  // ✅ два значения прогноза
  homePred?: number | null;
  awayPred?: number | null;

  canEdit: boolean;
  pointsText?: string;
  tip?: string;
};

export default function PredCellEditable({
  matchId,
  homePred,
  awayPred,
  canEdit,
  pointsText,
  tip,
}: Props) {
  const [home, setHome] = useState<string>(homePred == null ? "" : String(homePred));
  const [away, setAway] = useState<string>(awayPred == null ? "" : String(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHome(homePred == null ? "" : String(homePred));
  }, [homePred]);

  useEffect(() => {
    setAway(awayPred == null ? "" : String(awayPred));
  }, [awayPred]);

  function parseIntStrict(v: string): number | null | "bad" {
    const s = (v ?? "").trim();
    if (s === "") return null;
    if (!/^\d+$/.test(s)) return "bad";
    return Number(s);
  }

  async function save() {
    if (!canEdit) return;
    setError(null);

    const h = parseIntStrict(home);
    const a = parseIntStrict(away);

    if (h === null || a === null) {
      setError("Введите оба числа");
      return;
    }
    if (h === "bad" || a === "bad") {
      setError("Только цифры");
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
          home_pred: h,
          away_pred: a,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Ошибка сохранения");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  // 🟢 Просмотр
  if (!canEdit) {
    const text =
      homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`;

    return (
      <div title={tip} style={{ minHeight: 24 }}>
        <span style={{ opacity: text === "—" ? 0.4 : 1 }}>{text}</span>
        {pointsText && <span style={{ opacity: 0.75 }}> {pointsText}</span>}
      </div>
    );
  }

  // ✏️ Ввод — две ячейки
  return (
    <div style={{ minHeight: 28 }} title={tip}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          value={home}
          onChange={(e) => setHome(e.target.value)}
          onBlur={save}
          disabled={saving}
          placeholder="0"
          inputMode="numeric"
          style={{
            width: 34,
            padding: "2px 4px",
            borderRadius: 6,
            border: "1px solid #ccc",
            fontSize: 13,
            textAlign: "center",
          }}
        />
        <span style={{ opacity: 0.6 }}>:</span>
        <input
          value={away}
          onChange={(e) => setAway(e.target.value)}
          onBlur={save}
          disabled={saving}
          placeholder="0"
          inputMode="numeric"
          style={{
            width: 34,
            padding: "2px 4px",
            borderRadius: 6,
            border: "1px solid #ccc",
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
