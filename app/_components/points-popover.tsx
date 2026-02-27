"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PointsBreakdown = {
  total: number;

  predText: string;
  resText: string;

  // ===== legacy (страницы, которые ещё используют prediction_scores) =====
  teamGoals?: number;
  outcome?: number;
  diff?: number;
  nearBonus?: number;

  outcomeGuessed?: number;
  outcomeMult?: number;
  diffGuessed?: number;
  diffMult?: number;

  // ===== Вариант 1 (прозрачный чек) =====

  // Голы команд (баллы за угаданные голы каждой команды)
  homeGoalsPts?: number; // 0 или 0.5
  awayGoalsPts?: number; // 0 или 0.5
  homeGoalsPred?: number | null;
  awayGoalsPred?: number | null;
  homeGoalsRes?: number | null;
  awayGoalsRes?: number | null;

  // Исход
  outcomeBase?: number;
  outcomeTotal?: number;
  outcomeMultBonus?: number;
  outcomeMultDerived?: number | null;
  outcomeTotalPreds?: number | null;

  // Разница
  diffBase?: number;
  diffTotal?: number;
  diffMultBonus?: number;
  diffMultDerived?: number | null;
  diffTotalPreds?: number | null;

  // ✅ Промах на 1 мяч (отдельно)
  nearMissPts?: number; // 0 или 0.5
};

function fmt(n: number) {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v);
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

function multLabel(mult: number, guessed: number) {
  if (mult === 1.75) return `x1.75 (угадал только 1 участник)`;
  if (mult === 1.5) return `x1.5 (угадали 2 участника)`;
  if (mult === 1.25) return `x1.25 (угадали 3 участника)`;
  return `x1 (угадали ${guessed} участников)`;
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

  // если есть V1-поля — рендерим чек
  const isV1 =
    breakdown.outcomeBase != null ||
    breakdown.outcomeTotal != null ||
    breakdown.homeGoalsPts != null ||
    breakdown.awayGoalsPts != null ||
    breakdown.nearMissPts != null;

  // ===== V1 поля =====
  const homeGoalsPts = safeNum(breakdown.homeGoalsPts);
  const awayGoalsPts = safeNum(breakdown.awayGoalsPts);

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

  const nearMissPts = safeNum(breakdown.nearMissPts);

  const outcomeMult =
    breakdown.outcomeMult ??
    breakdown.outcomeMultDerived ??
    deriveMult(outcomeTotal, outcomeBase);

  const diffMult =
    breakdown.diffMult ??
    breakdown.diffMultDerived ??
    deriveMult(diffTotal, diffBase);

  // ===== legacy =====
  const teamGoals = safeNum(breakdown.teamGoals);
  const outcomeLegacy = safeNum(breakdown.outcome);
  const diffLegacy = safeNum(breakdown.diff);
  const nearBonusLegacy = safeNum(breakdown.nearBonus);

  return (
    <span className="ppWrap">
      <button
        ref={btnRef}
        type="button"
        className="ppBtn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        title="Показать расшифровку начисления"
      >
        ({fmt(pts)})
      </button>

      {open && (
        <div ref={popRef} id={id} role="dialog" className="ppPop">
          <div className="ppTitle">
            <span>Начисление за матч</span>
            <button className="ppClose" onClick={() => setOpen(false)} aria-label="Закрыть" type="button">
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

          {isV1 ? (
            <>
              {/* 1) Голы команд */}
              <div style={{ fontWeight: 900, marginBottom: 6 }}>1) Голы команд</div>

              <div className="ppLine">
                <span className="ppKey">Голы хозяев</span>
                <span className="ppVal">
                  +{fmt(homeGoalsPts)}
                  {breakdown.homeGoalsPred != null && breakdown.homeGoalsRes != null ? (
                    <span className="ppHint">
                      {" "}
                      (прогноз {breakdown.homeGoalsPred} → факт {breakdown.homeGoalsRes})
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Голы гостей</span>
                <span className="ppVal">
                  +{fmt(awayGoalsPts)}
                  {breakdown.awayGoalsPred != null && breakdown.awayGoalsRes != null ? (
                    <span className="ppHint">
                      {" "}
                      (прогноз {breakdown.awayGoalsPred} → факт {breakdown.awayGoalsRes})
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="ppHr" />

              {/* 2) Исход */}
              <div style={{ fontWeight: 900, marginBottom: 6 }}>2) Исход (П/Н/В)</div>

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

              {/* 3) Разница */}
              <div style={{ fontWeight: 900, marginBottom: 6 }}>3) Разница мячей</div>

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

              {/* 4) Промах на 1 мяч */}
              {nearMissPts > 0 ? (
                <>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>4) Бонусы</div>
                  <div className="ppLine">
                    <span className="ppKey">Промах на 1 мяч</span>
                    <span className="ppVal">+{fmt(nearMissPts)}</span>
                  </div>
                  <div className="ppHr" />
                </>
              ) : null}

              <div className="ppTotal">
                Итого: <b>{fmt(safeNum(breakdown.total ?? pts))}</b>
              </div>
            </>
          ) : (
            <>
              {/* legacy-рендер */}
              <div className="ppLine">
                <span className="ppKey">Голы команд</span>
                <span className="ppVal">{fmt(teamGoals)}</span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Исход</span>
                <span className="ppVal">
                  {fmt(outcomeLegacy)}{" "}
                  {breakdown.outcomeMult != null && breakdown.outcomeGuessed != null ? (
                    <span className="ppHint">
                      ({multLabel(Number(breakdown.outcomeMult), Number(breakdown.outcomeGuessed))})
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Разница</span>
                <span className="ppVal">
                  {fmt(diffLegacy)}{" "}
                  {breakdown.diffMult != null && breakdown.diffGuessed != null ? (
                    <span className="ppHint">
                      ({multLabel(Number(breakdown.diffMult), Number(breakdown.diffGuessed))})
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="ppLine">
                <span className="ppKey">Промах на 1 мяч</span>
                <span className="ppVal">{fmt(nearBonusLegacy)}</span>
              </div>

              <div className="ppHr" />

              <div className="ppTotal">
                Итого: <b>{fmt(safeNum(breakdown.total ?? pts))}</b>
              </div>

              <div className="ppMini">
                Угадали исход: <b>{Number(breakdown.outcomeGuessed ?? 0)}</b>, разницу:{" "}
                <b>{Number(breakdown.diffGuessed ?? 0)}</b>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}