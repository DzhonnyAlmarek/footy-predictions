import type { PointsBreakdown as PtsBD } from "@/app/_components/points-popover";

export type Pred = { h: number | null; a: number | null };

export function signOutcome(h: number, a: number): -1 | 0 | 1 {
  if (h === a) return 0;
  return h > a ? 1 : -1;
}

export function multByCount(cnt: number): number {
  if (cnt === 1) return 1.75;
  if (cnt === 2) return 1.5;
  if (cnt === 3) return 1.25;
  return 1;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildPointsBreakdown(params: {
  pred: Pred;
  resH: number | null;
  resA: number | null;

  outcomeMult: number;
  diffMult: number;

  outcomeGuessed: number;
  diffGuessed: number;
}): { pts: number | null; bd: PtsBD | null } {
  const {
    pred,
    resH,
    resA,
    outcomeMult,
    diffMult,
    outcomeGuessed,
    diffGuessed,
  } = params;

  if (pred.h == null || pred.a == null) return { pts: null, bd: null };
  if (resH == null || resA == null) return { pts: null, bd: null };

  let teamGoals = 0;
  let outcome = 0;
  let diff = 0;
  let nearBonus = 0;

  if (pred.h === resH) teamGoals += 0.5;
  if (pred.a === resA) teamGoals += 0.5;

  const outOk = signOutcome(pred.h, pred.a) === signOutcome(resH, resA);
  if (outOk) outcome = round2(2 * outcomeMult);

  const diffOk = pred.h - pred.a === resH - resA;
  if (diffOk) diff = round2(1 * diffMult);

  const dist = Math.abs(pred.h - resH) + Math.abs(pred.a - resA);
  if (dist === 1) nearBonus = 0.5;

  const total = round2(teamGoals + outcome + diff + nearBonus);

  const bd: PtsBD = {
    total,
    teamGoals,
    outcome,
    diff,
    nearBonus,
    outcomeGuessed,
    outcomeMult,
    diffGuessed,
    diffMult,
    predText: `${pred.h}:${pred.a}`,
    resText: `${resH}:${resA}`,
  };

  return { pts: total, bd };
}
