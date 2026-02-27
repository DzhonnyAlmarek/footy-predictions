"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PointsBreakdown = {
  total: number;

  // Для текста
  predText: string; // "2:1"
  resText: string; // "1:0"

  // 1) Голы команд (разбивка)
  homeGoalsPts: number; // 0 или 0.5
  awayGoalsPts: number; // 0 или 0.5
  homeGoalsPred?: number | null;
  awayGoalsPred?: number | null;
  homeGoalsRes?: number | null;
  awayGoalsRes?: number | null;

  // 2) Исход
  outcomeBase: number; // база (обычно 2)
  outcomeTotal: number; // итог за исход (с учетом множителя)
  outcomeMultBonus: number; // outcomeTotal - outcomeBase
  outcomeMult: number | null; // вычисленный множитель (outcomeTotal/outcomeBase)
  outcomeGuessed: number | null; // сколько участников угадали исход
  outcomeTotalPreds: number | null; // сколько прогнозов учитывали (сдали прогноз)

  // 3) Разница
  diffBase: number; // база (обычно 1)
  diffTotal: number; // итог за разницу (с учетом множителя)
  diffMultBonus: number; // diffTotal - diffBase
  diffMult: number | null; // вычисленный множитель (diffTotal/diffBase)
  diffGuessed: number | null; // сколько участников угадали разницу
  diffTotalPreds: number | null; // сколько прогнозов учитывали

  // 4) Прочие бонусы (из ledger)
  h1: number; // например 0.5
  h2: number; // например 0.5
  bonus: number; // прочее
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

  const homeGoalsPts = safeNum(breakdown.homeGoalsPts);
  const awayGoalsPts = safeNum(breakdown.awayGoalsPts);
  const goalsTotal = round2(homeGoalsPts + awayGoalsPts);

  const outcomeBase = safeNum(breakdown.outcomeBase);
  const outcomeTotal = safeNum(breakdown.outcomeTotal);
  const outcomeMultBonus = safeNum(breakdown.outcomeMultBonus);
  const outcomeMult = breakdown.outcomeMult;
  const outcomeGuessed = breakdown.outcomeGuessed;
  const outcomeTotalPreds = breakdown.outcomeTotalPreds;

  const diffBase = safeNum(breakdown.diffBase);
  const diffTotal = safeNum(breakdown.diffTotal);
  const diffMultBonus = safeNum(breakdown.diffMultBonus);
  const diffMult = breakdown.diffMult;
  const diffGuessed = breakdown.diffGuessed;
  const diffTotalPreds = breakdown.diffTotalPreds;

  const h1 = safeNum(breakdown.h1);
  const h2 = safeNum(breakdown.h2);
  const bonus = safeNum(breakdown.bonus);
  const bonusesTotal = round2(h1 + h2 + bonus);

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
            <button
              className="ppClose"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              type="button"
            >
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

          {/* 1) Голы команд */}
          <div style={{ fontWeight: 900, marginBottom: 6 }}>1) Голы команд</div>

          <div className="ppLine">
            <span className="ppKey">Хозяева (забитые)</span>
            <span className="ppVal">
              +{fmt(homeGoalsPts)}
              {breakdown.homeGoalsPred != null && breakdown.homeGoalsRes != null ? (
                <span className="ppHint"> (прогноз {breakdown.homeGoalsPred} → факт {breakdown.homeGoalsRes})</span>
              ) : null}
            </span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Гости (забитые)</span>
            <span className="ppVal">
              +{fmt(awayGoalsPts)}
              {breakdown.awayGoalsPred != null && breakdown.awayGoalsRes != null ? (
                <span className="ppHint"> (прогноз {breakdown.awayGoalsPred} → факт {breakdown.awayGoalsRes})</span>
              ) : null}
            </span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Итого за голы</span>
            <span className="ppVal">
              <b>+{fmt(goalsTotal)}</b>
            </span>
          </div>

          <div className="ppHr" />

          {/* 2) Исход */}
          <div style={{ fontWeight: 900, marginBottom: 6 }}>2) Исход (П/Н/В)</div>

          <div className="ppLine">
            <span className="ppKey">База за исход</span>
            <span className="ppVal">+{fmt(outcomeBase)}</span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Множитель</span>
            <span className="ppVal">
              {outcomeMult != null ? `×${fmt(outcomeMult)}` : "—"}
              {outcomeGuessed != null && outcomeTotalPreds != null ? (
                <span className="ppHint"> (угадали {outcomeGuessed} из {outcomeTotalPreds})</span>
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
              {outcomeMult != null ? (
                <span className="ppHint"> ({fmt(outcomeBase)}×{fmt(outcomeMult)} − {fmt(outcomeBase)})</span>
              ) : null}
            </span>
          </div>

          <div className="ppHr" />

          {/* 3) Разница */}
          <div style={{ fontWeight: 900, marginBottom: 6 }}>3) Разница мячей</div>

          <div className="ppLine">
            <span className="ppKey">База за разницу</span>
            <span className="ppVal">+{fmt(diffBase)}</span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Множитель</span>
            <span className="ppVal">
              {diffMult != null ? `×${fmt(diffMult)}` : "—"}
              {diffGuessed != null && diffTotalPreds != null ? (
                <span className="ppHint"> (угадали {diffGuessed} из {diffTotalPreds})</span>
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
              {diffMult != null ? (
                <span className="ppHint"> ({fmt(diffBase)}×{fmt(diffMult)} − {fmt(diffBase)})</span>
              ) : null}
            </span>
          </div>

          <div className="ppHr" />

          {/* 4) Бонусы */}
          <div style={{ fontWeight: 900, marginBottom: 6 }}>4) Прочие бонусы</div>

          <div className="ppLine">
            <span className="ppKey">H1</span>
            <span className="ppVal">+{fmt(h1)}</span>
          </div>
          <div className="ppLine">
            <span className="ppKey">H2</span>
            <span className="ppVal">+{fmt(h2)}</span>
          </div>
          <div className="ppLine">
            <span className="ppKey">Бонус</span>
            <span className="ppVal">+{fmt(bonus)}</span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Итого бонусы</span>
            <span className="ppVal">
              <b>+{fmt(bonusesTotal)}</b>
            </span>
          </div>

          <div className="ppHr" />

          <div className="ppTotal">
            Итого: <b>{fmt(safeNum(breakdown.total ?? pts))}</b>
          </div>

          {(outcomeGuessed != null && outcomeTotalPreds != null) || (diffGuessed != null && diffTotalPreds != null) ? (
            <div className="ppMini">
              Угадали исход: <b>{outcomeGuessed ?? "—"}</b>/{outcomeTotalPreds ?? "—"}, разницу:{" "}
              <b>{diffGuessed ?? "—"}</b>/{diffTotalPreds ?? "—"}
            </div>
          ) : null}
        </div>
      )}
    </span>
  );
}