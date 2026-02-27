"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PointsBreakdown = {
  total: number;

  // Компоненты (могут быть 0, если модель их не хранит)
  teamGoals?: number; // 0..1 (0.5 + 0.5)
  outcome?: number; // 0..(2 * mult) или просто 2
  diff?: number; // 0..(1 * mult) или просто 1
  nearBonus?: number; // 0 или 0.5 или сумма бонусов

  // Множители + причины (опционально; в points_ledger их нет)
  outcomeGuessed?: number;
  outcomeMult?: number; // 1 / 1.25 / 1.5 / 1.75
  diffGuessed?: number;
  diffMult?: number;

  // Для текста
  predText: string; // "2:1"
  resText: string; // "2:1"
};

function fmt(n: number) {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v);
}

function multLabel(mult: number, guessed: number) {
  if (mult === 1.75) return `x1.75 (угадал только 1 участник)`;
  if (mult === 1.5) return `x1.5 (угадали 2 участника)`;
  if (mult === 1.25) return `x1.25 (угадали 3 участника)`;
  return `x1 (угадали ${guessed} участников)`;
}

function hasMultInfo(b: PointsBreakdown) {
  // считаем, что “информация есть”, только если mult задан и guessed задан
  const om = b.outcomeMult;
  const og = b.outcomeGuessed;
  const dm = b.diffMult;
  const dg = b.diffGuessed;

  const outcomeOk = typeof om === "number" && typeof og === "number";
  const diffOk = typeof dm === "number" && typeof dg === "number";
  return outcomeOk || diffOk;
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

  const teamGoals = Number(breakdown.teamGoals ?? 0);
  const outcome = Number(breakdown.outcome ?? 0);
  const diff = Number(breakdown.diff ?? 0);
  const nearBonus = Number(breakdown.nearBonus ?? 0);

  const showMult = hasMultInfo(breakdown);

  // чтобы не показывать “пустые” строки, если компонент = 0 и он не релевантен
  const showTeamGoals = teamGoals !== 0;
  const showNearBonus = nearBonus !== 0;

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

          {showTeamGoals && (
            <div className="ppLine">
              <span className="ppKey">Голы команд</span>
              <span className="ppVal">{fmt(teamGoals)}</span>
            </div>
          )}

          <div className="ppLine">
            <span className="ppKey">Исход</span>
            <span className="ppVal">
              {fmt(outcome)}{" "}
              {showMult && typeof breakdown.outcomeMult === "number" && typeof breakdown.outcomeGuessed === "number" ? (
                <span className="ppHint">
                  ({multLabel(breakdown.outcomeMult, breakdown.outcomeGuessed)})
                </span>
              ) : null}
            </span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Разница</span>
            <span className="ppVal">
              {fmt(diff)}{" "}
              {showMult && typeof breakdown.diffMult === "number" && typeof breakdown.diffGuessed === "number" ? (
                <span className="ppHint">
                  ({multLabel(breakdown.diffMult, breakdown.diffGuessed)})
                </span>
              ) : null}
            </span>
          </div>

          {showNearBonus && (
            <div className="ppLine">
              <span className="ppKey">Бонусы</span>
              <span className="ppVal">{fmt(nearBonus)}</span>
            </div>
          )}

          <div className="ppHr" />

          <div className="ppTotal">
            Итого: <b>{fmt(Number(breakdown.total ?? pts))}</b>
          </div>

          {showMult && (
            <div className="ppMini">
              Угадали исход: <b>{Number(breakdown.outcomeGuessed ?? 0)}</b>, разницу:{" "}
              <b>{Number(breakdown.diffGuessed ?? 0)}</b>
            </div>
          )}
        </div>
      )}
    </span>
  );
}