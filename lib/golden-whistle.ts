export function basePredictionPoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
) {
  let points = 0;
  if (Math.sign(predictedHome - predictedAway) === Math.sign(actualHome - actualAway)) points += 2;
  if (predictedHome - predictedAway === actualHome - actualAway) points += 1;
  if (predictedHome === actualHome) points += 0.5;
  if (predictedAway === actualAway) points += 0.5;
  if (Math.abs(predictedHome - actualHome) + Math.abs(predictedAway - actualAway) === 1) points += 0.5;
  return points;
}

export function goldenWhistlePoints(
  actualPoints: number,
  pointsWithPenalties: number,
  pointsWithoutPenalties: number
) {
  if (pointsWithPenalties <= pointsWithoutPenalties) return 0;
  return Math.max(actualPoints - pointsWithoutPenalties, 0);
}

export function formatWhistlePoints(value: number) {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
