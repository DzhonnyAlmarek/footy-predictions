"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PointsBreakdown = {
  total: number;

  // Компоненты
  teamGoals: number; // 0..1 (0.5 + 0.5)
  outcome: number; // 0..(2 * mult)
  diff: number; // 0..(1 * mult)
  nearBonus: number; // 0 или 0.5

  // Множители + причины
  outcomeGuessed: number; // сколько участников угадали исход
  outcomeMult: number; // 1 / 1.25 / 1.5 / 1.75
  diffGuessed: number; // сколько участников угадали разницу
  diffMult: number;

  // Для текста
  predText: string; // "2:1"
  resText: string; // "2:1"
};

function fmt(n: number) {
  const v = Math.round(n * 100) / 100;
  // чтобы 1.0 выглядел как "1", а 0.5 как "0.5"
  return Number.isInteger(v) ? String(v) : String(v);
}

function multLabel(mult: number, guessed: number) {
  if (mult === 1.75) return `x1.75 (угадал только 1 участник)`;
  if (mult === 1.5) return `x1.5 (угадали 2 участника)`;
  if (mult === 1.25) return `x1.25 (угадали 3 участника)`;
  return `x1 (угадали ${guessed} участников)`;
}

export default function PointsPopover(props: {
  pts: number;
  breakdown: PointsBreakdown;
}) {
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

          <div className="ppLine">
            <span className="ppKey">Голы команд</span>
            <span className="ppVal">{fmt(breakdown.teamGoals)}</span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Исход</span>
            <span className="ppVal">
              {fmt(breakdown.outcome)}{" "}
              <span className="ppHint">
                ({multLabel(breakdown.outcomeMult, breakdown.outcomeGuessed)})
              </span>
            </span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Разница</span>
            <span className="ppVal">
              {fmt(breakdown.diff)}{" "}
              <span className="ppHint">
                ({multLabel(breakdown.diffMult, breakdown.diffGuessed)})
              </span>
            </span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Промах на 1 мяч</span>
            <span className="ppVal">{fmt(breakdown.nearBonus)}</span>
          </div>

          <div className="ppHr" />

          <div className="ppTotal">
            Итого: <b>{fmt(breakdown.total)}</b>
          </div>

          <div className="ppMini">
            Угадали исход: <b>{breakdown.outcomeGuessed}</b>, разницу:{" "}
            <b>{breakdown.diffGuessed}</b>
          </div>
        </div>
      )}
    </span>
  );
}
