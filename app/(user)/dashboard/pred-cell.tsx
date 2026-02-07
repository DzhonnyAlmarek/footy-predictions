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
  const [ok, setOk] = useState(false);

  useEffect(() => setH(homePred == null ? "" : String(homePred)), [homePred]);
  useEffect(() => setA(awayPred == null ? "" : String(awayPred)), [awayPred]);

  async function save() {
    if (!canEdit) return;

    setError(null);
    setOk(false);

    const hh = h.trim();
    const aa = a.trim();

    // пусто-пусто — считаем “не задано”
    if (hh === "" && aa === "") return;

    const home = hh === "" ? null : Number(hh);
    const away = aa === "" ? null : Number(aa);

    if (home === null || away === null) {
      setError("Введите оба числа");
      return;
    }
    if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away) || away < 0) {
      setError("Только целые 0+");
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

      setOk(true);
      // маленький авто-сброс “ок”
      setTimeout(() => setOk(false), 900);
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return <span className="predText">{homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`}</span>;
  }

  return (
    <div className="predCell">
      <input
        className="predInput"
        value={h}
        onChange={(e) => setH(e.target.value)}
        onBlur={save}
        inputMode="numeric"
        placeholder="0"
        disabled={saving}
      />
      <span className="predSep">:</span>
      <input
        className="predInput"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onBlur={save}
        inputMode="numeric"
        placeholder="0"
        disabled={saving}
      />

      {saving ? <span className="predSaving">…</span> : null}
      {ok ? <span className="smallHint">✓</span> : null}
      {error ? <span className="inlineErr">{error}</span> : null}
    </div>
  );
}
