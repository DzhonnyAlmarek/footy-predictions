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

  useEffect(() => setH(homePred == null ? "" : String(homePred)), [homePred]);
  useEffect(() => setA(awayPred == null ? "" : String(awayPred)), [awayPred]);

  async function post(body: any) {
    const res = await fetch("/api/predictions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Ошибка сохранения");
  }

  async function save() {
    if (!canEdit) return;

    setError(null);
    const hh = h.trim();
    const aa = a.trim();

    // ✅ очистка любого поля => удалить прогноз полностью
    if (hh === "" || aa === "") {
      setSaving(true);
      try {
        await post({ match_id: matchId, home_pred: null, away_pred: null });
        setH("");
        setA("");
      } catch (e: any) {
        setError(e?.message ?? "Ошибка");
      } finally {
        setSaving(false);
      }
      return;
    }

    const home = Number(hh);
    const away = Number(aa);

    if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away) || away < 0) {
      setError("Только целые числа 0+");
      return;
    }

    setSaving(true);
    try {
      await post({ match_id: matchId, home_pred: home, away_pred: away });
    } catch (e: any) {
      setError(e?.message ?? "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return <span className="mono">{homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`}</span>;
  }

  return (
    <div className="predCell">
      <input
        className="predInput"
        value={h}
        onChange={(e) => setH(e.target.value)}
        onBlur={save}
        inputMode="numeric"
        placeholder=""
        disabled={saving}
      />
      <span className="predSep">:</span>
      <input
        className="predInput"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onBlur={save}
        inputMode="numeric"
        placeholder=""
        disabled={saving}
      />

      {saving ? <span className="predSaving">…</span> : null}
      {error ? <span className="inlineErr">{error}</span> : null}
    </div>
  );
}
