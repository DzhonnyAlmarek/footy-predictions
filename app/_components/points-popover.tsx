"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PointsBreakdown = {
  total: number;

  predText: string;
  resText: string;

  // legacy (для совместимости)
  teamGoals?: number;
  outcome?: number;
  diff?: number;
  nearBonus?: number;
  outcomeGuessed?: number;
  outcomeMult?: number;
  diffGuessed?: number;
  diffMult?: number;

  // ===== Вариант 1 (прозрачный чек) =====

  homeGoalsPts?: number;
  awayGoalsPts?: number;
  homeGoalsPred?: number | null;
  awayGoalsPred?: number | null;
  homeGoalsRes?: number | null;
  awayGoalsRes?: number | null;

  outcomeBase?: number;
  outcomeTotal?: number;
  outcomeMultBonus?: number;
  outcomeMultDerived?: number | null;
  outcomeTotalPreds?: number | null;

  diffBase?: number;
  diffTotal?: number;
  diffMultBonus?: number;
  diffMultDerived?: number | null;
  diffTotalPreds?: number | null;

  // near miss
  h1?: number;
  h2?: number;
  bonus?: number;
};

function fmt(n: number) {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function deriveMult(totalPart: number, base: number) {
  if (!base || base <= 0) return null;
  const m = totalPart / base;
  const r = Math.round(m * 100) / 100;
  return Number.isFinite(r) ? r : null;
}

export default function PointsPopover(props: { pts: number; breakdown: PointsBreakdown }) {
  const { pts, breakdown } = props;
  const [open, setOpen] = useState(false);
  const id = useId();

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const isV1 =
    breakdown.outcomeBase != null ||
    breakdown.outcomeTotal != null ||
    breakdown.homeGoalsPts != null;

  // ===== V1 поля =====
  const homeGoalsPts = safeNum(breakdown.homeGoalsPts);
  const awayGoalsPts = safeNum(breakdown.awayGoalsPts);
  const goalsTotal = round2(homeGoalsPts + awayGoalsPts);

  const outcomeBase = safeNum(breakdown.outcomeBase);
  const outcomeTotal = safeNum(breakdown.outcomeTotal);
  const outcomeMultBonus = safeNum(breakdown.outcomeMultBonus);
  const outcomeGuessed = breakdown.outcomeGuessed ?? null;
  const outcomeTotalPreds = breakdown.outcomeTotalPreds ?? null;

  const diffBase = safeNum(breakdown.diffBase);
  const diffTotal = safeNum(breakdown.diffTotal);
  const diffMultBonus = safeNum(breakdown.diffMultBonus);
  const diffGuessed = breakdown.diffGuessed ?? null;
  const diffTotalPreds = breakdown.diffTotalPreds ?? null;

  const h1 = safeNum(breakdown.h1);
  const h2 = safeNum(breakdown.h2);
  const bonus = safeNum(breakdown.bonus);

  const nearMissTotal = round2(h1 + h2);
  const extraBonus = round2(bonus);

  const outcomeMult =
    breakdown.outcomeMult ??
    breakdown.outcomeMultDerived ??
    deriveMult(outcomeTotal, outcomeBase);

  const diffMult =
    breakdown.diffMult ??
    breakdown.diffMultDerived ??
    deriveMult(diffTotal, diffBase);

  return (
    <span className="ppWrap">
      <button
        ref={btnRef}
        type="button"
        className="ppBtn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        ({fmt(pts)})
      </button>

      {open && (
        <div ref={popRef} id={id} role="dialog" className="ppPop">
          <div className="ppTitle">
            <span>Начисление за матч</span>
            <button className="ppClose" onClick={() => setOpen(false)} type="button">
              ✕
            </button>
          </div>

          <div className="ppLine">
            <span className="ppKey">Прогноз</span>
            <span className="ppVal mono">{breakdown.predText}</span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Результат</span>
            <span className="ppVal mono">{breakdown.resText}</span>
          </div>

          <div className="ppHr" />

          {isV1 && (
            <>
              {/* Исход */}
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Исход (П/Н/В)
              </div>

              <div className="ppLine">
                <span className="ppKey">База</span>
                <span className="ppVal">+{fmt(outcomeBase)}</span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Множитель</span>
                <span className="ppVal">
                  {outcomeMult != null ? `×${fmt(outcomeMult)}` : "—"}
                  {outcomeGuessed != null && outcomeTotalPreds != null ? (
                    <span className="ppHint">
                      {" "}
                      (угадали {outcomeGuessed} из {outcomeTotalPreds})
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Бонус множителя</span>
                <span className="ppVal">+{fmt(outcomeMultBonus)}</span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Итого за исход</span>
                <span className="ppVal">
                  <b>+{fmt(outcomeTotal)}</b>
                </span>
              </div>

              <div className="ppHr" />

              {/* Разница */}
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Разница мячей
              </div>

              <div className="ppLine">
                <span className="ppKey">База</span>
                <span className="ppVal">+{fmt(diffBase)}</span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Множитель</span>
                <span className="ppVal">
                  {diffMult != null ? `×${fmt(diffMult)}` : "—"}
                  {diffGuessed != null && diffTotalPreds != null ? (
                    <span className="ppHint">
                      {" "}
                      (угадали {diffGuessed} из {diffTotalPreds})
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Бонус множителя</span>
                <span className="ppVal">+{fmt(diffMultBonus)}</span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Итого за разницу</span>
                <span className="ppVal">
                  <b>+{fmt(diffTotal)}</b>
                </span>
              </div>

              <div className="ppHr" />

              {/* Промах на 1 мяч */}
              {nearMissTotal > 0 && (
                <>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    Бонус за близкий прогноз
                  </div>

                  <div className="ppLine">
                    <span className="ppKey">Промах на 1 мяч</span>
                    <span className="ppVal">
                      +{fmt(nearMissTotal)}
                    </span>
                  </div>

                  <div className="ppHr" />
                </>
              )}

              {/* Дополнительный бонус */}
              {extraBonus > 0 && (
                <>
                  <div className="ppLine">
                    <span className="ppKey">Дополнительный бонус</span>
                    <span className="ppVal">
                      +{fmt(extraBonus)}
                    </span>
                  </div>
                  <div className="ppHr" />
                </>
              )}

              <div className="ppTotal">
                Итого: <b>{fmt(safeNum(breakdown.total ?? pts))}</b>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}