// Pure scoring tests; no database, network, secrets, or changes to match results.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

function loadTs(relativePath) {
  const filename = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(js, filename);
  return mod.exports;
}
const { basePredictionPoints, goldenWhistlePoints } = loadTs('lib/golden-whistle.ts');
const { buildPointsBreakdown, multByCount, signOutcome } = loadTs('lib/points/breakdown.ts');

test('outcomes including draws', () => {
  assert.equal(signOutcome(3, 2), 1);
  assert.equal(signOutcome(1, 1), 0);
  assert.equal(signOutcome(0, 2), -1);
});
test('multiplier thresholds: one, two, three, four correct forecasts', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map(multByCount), [1.75, 1.5, 1.25, 1, 1]);
});
test('exact forecast earns full base points', () => {
  assert.equal(basePredictionPoints(2, 1, 2, 1), 4);
});
test('one-goal miss, correct outcome and goal difference', () => {
  assert.equal(basePredictionPoints(2, 1, 3, 2), 3);
  assert.equal(basePredictionPoints(2, 1, 2, 2), 0.5);
});
test('score breakdown including outcome/difference multipliers', () => {
  const { pts, bd } = buildPointsBreakdown({
    pred: { h: 2, a: 1 }, resH: 2, resA: 1,
    outcomeMult: 1.75, diffMult: 1.5, outcomeGuessed: 1, diffGuessed: 2,
  });
  assert.equal(pts, 6);
  assert.equal(bd.total, 6);
  assert.equal(bd.outcome, 3.5);
  assert.equal(bd.diff, 1.5);
  assert.equal(bd.teamGoals, 1);
});
test('incomplete prediction cannot be scored', () => {
  assert.deepEqual(buildPointsBreakdown({
    pred: { h: null, a: 1 }, resH: 2, resA: 1,
    outcomeMult: 1, diffMult: 1, outcomeGuessed: 0, diffGuessed: 0,
  }), { pts: null, bd: null });
});
test('golden whistle only rewards beneficial penalty inclusion', () => {
  assert.equal(goldenWhistlePoints(5, 5, 3), 2);
  assert.equal(goldenWhistlePoints(3, 3, 5), 0);
  assert.equal(goldenWhistlePoints(4, 4, 4), 0);
});
