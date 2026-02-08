"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  matchId: number;
  homePred: number | null;
  awayPred: number | null;
  canEdit: boolean;
};

function isInt0(v: number) {
  return Number.isInteger(v) && v >= 0;
}

export default function PredCellEditable({ matchId, homePred, awayPred, canEdit }: Props) {
  // локальное состояние — источник правды при вводе
  const [h, setH] = useState(homePred == null ? "" : String(homePred));
  const [a, setA] = useState(awayPred == null ? "" : String(awayPred));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // чтобы не перетирать ввод пользователя старыми props
  const hydratedRef = useRef(false);
  const lastMatchIdRef = useRef(matchId);

  // 1) при смене matchId — реинициализируем
  useEffect(() => {
    if (lastMatchIdRef.current !== matchId) {
      lastMatchIdRef.current = matchId;
      hydratedRef.current = false;
      setH(homePred == null ? "" : String(homePred));
      setA(awayPred == null ? "" : String(awayPred));
      setError(null);
    }
  }, [matchId, homePred, awayPred]);

  // 2) один раз на монтировании — заполняем из props
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setH(homePred == null ? "" : String(homePred));
    setA(awayPred == null ? "" : String(awayPred));
  }, [homePred, awayPred]);

  async function persist() {
    if (!canEdit) return;

    setError(null);

    const hh = h.trim();
    const aa = a.trim();

    // ✅ если оба пустые — это "удалить прогноз"
    const wantDelete = hh === "" && aa === "";

    // ✅ если заполнено только одно поле — НЕ сохраняем и НЕ ругаемся
    if (!wantDelete && (hh === "" || aa === "")) return;

    // парсим
    const home = wantDelete ? null : Number(hh);
    const away = wantDelete ? null : Number(aa);

    if (!wantDelete) {
      if (!Number.isFinite(home!) || !Number.isFinite(away!)) return;
      if (!isInt0(home!) || !isInt0(away!)) {
        setError("Только целые числа 0+");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          home_pred: home, // null => delete
          away_pred: away, // null => delete
        }),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Ошибка сохранения");
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <span className="mono">
        {homePred == null || awayPred == null ? "—" : `${homePred}:${awayPred}`}
      </span>
    );
  }

  return (
    <div className="predCell">
      <input
        className="predInput"
        value={h}
        onChange={(e) => setH(e.target.value)}
        onBlur={persist}
        inputMode="numeric"
        placeholder=""
        disabled={saving}
        aria-label="Голы хозяев"
      />
      <span className="predSep">:</span>
      <input
        className="predInput"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onBlur={persist}
        inputMode="numeric"
        placeholder=""
        disabled={saving}
        aria-label="Голы гостей"
      />

      {saving ? <span className="predSaving">…</span> : null}
      {error ? <span className="inlineErr">{error}</span> : null}
    </div>
  );
}
