"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PointsBreakdown = {
  total: number;

  // Текст
  predText: string; // "2:1"
  resText: string; // "2:1"

  // Legacy-поля (могут приходить из prediction_scores)
  teamGoals?: number; // 0..1
  outcome?: number; // 0..(2*mult) или просто 2
  diff?: number; // 0..(1*mult) или просто 1
  nearBonus?: number; // 0 или 0.5 или сумма бонусов

  outcomeGuessed?: number;
  outcomeMult?: number; // 1/1.25/1.5/1.75
  diffGuessed?: number;
  diffMult?: number;

  // ✅ Ledger-детализация (points_ledger)
  outcomeBase?: number;
  outcomeMultBonus?: number; // бонус множителя по исходу
  diffBase?: number;
  diffMultBonus?: number; // бонус множителя по разнице

  h1?: number;
  h2?: number;
  bonus?: number; // прочие бонусы
};

function fmt(n: number) {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v);
}

function safeNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function deriveMult(totalPart: number, base: number) {
  if (base <= 0) return null;
  const m = totalPart / base;
  const r = Math.round(m * 100) / 100;
  return r;
}

function multLabel(mult: number, guessed: number) {
  if (mult === 1.75) return `x1.75 (угадал только 1 участник)`;
  if (mult === 1.5) return `x1.5 (угадали 2 участника)`;
  if (mult === 1.25) return `x1.25 (угадали 3 участника)`;
  return `x1 (угадали ${guessed} участников)`;
}

function hasLegacyMultInfo(b: PointsBreakdown) {
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

  // Ledger-поля
  const outcomeBase = safeNum(breakdown.outcomeBase);
  const outcomeMultBonus = safeNum(breakdown.outcomeMultBonus);
  const diffBase = safeNum(breakdown.diffBase);
  const diffMultBonus = safeNum(breakdown.diffMultBonus);

  const h1 = safeNum(breakdown.h1);
  const h2 = safeNum(breakdown.h2);
  const bonus = safeNum(breakdown.bonus);

  const hasLedgerDetail =
    outcomeBase !== 0 ||
    outcomeMultBonus !== 0 ||
    diffBase !== 0 ||
    diffMultBonus !== 0 ||
    h1 !== 0 ||
    h2 !== 0 ||
    bonus !== 0;

  // Итоги по компонентам
  const outcomeTotal = hasLedgerDetail ? round2(outcomeBase + outcomeMultBonus) : safeNum(breakdown.outcome);
  const diffTotal = hasLedgerDetail ? round2(diffBase + diffMultBonus) : safeNum(breakdown.diff);
  const bonusesTotal = hasLedgerDetail ? round2(h1 + h2 + bonus) : safeNum(breakdown.nearBonus);

  // legacy (командные голы)
  const teamGoals = safeNum(breakdown.teamGoals);

  // Вывод множителя в ledger-режиме (вычисляем из total/base)
  const outcomeMultDerived = hasLedgerDetail ? deriveMult(outcomeTotal, outcomeBase) : null;
  const diffMultDerived = hasLedgerDetail ? deriveMult(diffTotal, diffBase) : null;

  // Показ строк (чтобы не засорять нулями)
  const showTeamGoals = teamGoals !== 0;
  const showBonuses = bonusesTotal !== 0;

  const showLegacyMult = !hasLedgerDetail && hasLegacyMultInfo(breakdown);

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

          {showTeamGoals && (
            <div className="ppLine">
              <span className="ppKey">Голы команд</span>
              <span className="ppVal">{fmt(teamGoals)}</span>
            </div>
          )}

          <div className="ppLine">
            <span className="ppKey">Исход</span>
            <span className="ppVal">
              {fmt(outcomeTotal)}
              {hasLedgerDetail ? (
                <span className="ppHint">
                  {" "}
                  (база {fmt(outcomeBase)}
                  {outcomeMultDerived ? ` × ${fmt(outcomeMultDerived)}` : ""}
                  {outcomeMultBonus !== 0 ? `, бонус множителя +${fmt(outcomeMultBonus)}` : ""}
                  )
                </span>
              ) : showLegacyMult && breakdown.outcomeMult != null && breakdown.outcomeGuessed != null ? (
                <span className="ppHint">
                  {" "}
                  ({multLabel(Number(breakdown.outcomeMult), Number(breakdown.outcomeGuessed))})
                </span>
              ) : null}
            </span>
          </div>

          <div className="ppLine">
            <span className="ppKey">Разница</span>
            <span className="ppVal">
              {fmt(diffTotal)}
              {hasLedgerDetail ? (
                <span className="ppHint">
                  {" "}
                  (база {fmt(diffBase)}
                  {diffMultDerived ? ` × ${fmt(diffMultDerived)}` : ""}
                  {diffMultBonus !== 0 ? `, бонус множителя +${fmt(diffMultBonus)}` : ""}
                  )
                </span>
              ) : showLegacyMult && breakdown.diffMult != null && breakdown.diffGuessed != null ? (
                <span className="ppHint">
                  {" "}
                  ({multLabel(Number(breakdown.diffMult), Number(breakdown.diffGuessed))})
                </span>
              ) : null}
            </span>
          </div>

          {showBonuses && (
            <div className="ppLine">
              <span className="ppKey">Бонусы</span>
              <span className="ppVal">
                {fmt(bonusesTotal)}
                {hasLedgerDetail ? (
                  <span className="ppHint">
                    {" "}
                    (H1 {fmt(h1)} + H2 {fmt(h2)}
                    {bonus !== 0 ? ` + бонус ${fmt(bonus)}` : ""}
                    )
                  </span>
                ) : null}
              </span>
            </div>
          )}

          <div className="ppHr" />

          <div className="ppTotal">
            Итого: <b>{fmt(safeNum(breakdown.total ?? pts))}</b>
          </div>

          {showLegacyMult ? (
            <div className="ppMini">
              Угадали исход: <b>{Number(breakdown.outcomeGuessed ?? 0)}</b>, разницу:{" "}
              <b>{Number(breakdown.diffGuessed ?? 0)}</b>
            </div>
          ) : null}
        </div>
      )}
    </span>
  );
}