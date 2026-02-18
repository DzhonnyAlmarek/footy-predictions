"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  matchId: number;
  homePred: number | null;
  awayPred: number | null;
  canEdit: boolean;
};

function norm(v: string) {
  return v.replace(/[^\d]/g, ""); // только цифры
}

export default function PredCellEditable({ matchId, homePred, awayPred, canEdit }: Props) {
  const [h, setH] = useState(homePred == null ? "" : String(homePred));
  const [a, setA] = useState(awayPred == null ? "" : String(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // чтобы не перетирать ввод пользователя, пока он печатает
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setH(homePred == null ? "" : String(homePred));
  }, [homePred]);

  useEffect(() => {
    if (dirtyRef.current) return;
    setA(awayPred == null ? "" : String(awayPred));
  }, [awayPred]);

  async function saveCurrent(nextH: string, nextA: string) {
    if (!canEdit) return;

    const hh = nextH.trim();
    const aa = nextA.trim();

    // ✅ оба пустые -> удалить прогноз
    if (hh === "" && aa === "") {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/predictions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ match_id: matchId, home_pred: null, away_pred: null }),
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Ошибка удаления");
      } catch (e: any) {
        setError(e?.message || "Ошибка");
      } finally {
        setSaving(false);
        dirtyRef.current = false;
      }
      return;
    }

    // ✅ сохраняем только когда оба заполнены и валидны (без “введите оба числа”)
    if (hh === "" || aa === "") return;

    const home = Number(hh);
    const away = Number(aa);

    if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away) || away < 0) {
      setError("Только целые 0+");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, home_pred: home, away_pred: away }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Ошибка сохранения");
      dirtyRef.current = false;
    } catch (e: any) {
      setError(e?.message || "Ошибка");
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
        onChange={(e) => {
          dirtyRef.current = true;
          setError(null);
          setH(norm(e.target.value));
        }}
        onBlur={() => saveCurrent(h, a)}
        inputMode="numeric"
        placeholder=""
        disabled={saving}
      />
      <span className="predSep">:</span>
      <input
        className="predInput"
        value={a}
        onChange={(e) => {
          dirtyRef.current = true;
          setError(null);
          setA(norm(e.target.value));
        }}
        onBlur={() => saveCurrent(h, a)}
        inputMode="numeric"
        placeholder=""
        disabled={saving}
      />

      {saving ? <span className="predSaving">…</span> : null}
      {error ? <span className="inlineErr">{error}</span> : null}
    </div>
  );
}
