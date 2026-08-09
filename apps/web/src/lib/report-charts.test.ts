/**
 * The screen and the PDF draw from this module, so a mistake here is wrong in two
 * places at once and looks like a rendering bug in both.
 *
 * Run: npx tsx src/lib/report-charts.test.ts   (from apps/web)
 */
import assert from 'node:assert/strict';
import {
  donutPath, radarGeometry, scoreBand, weakestFirst, contribution, idealBand, pieSlices, CRITERION_PASS,
  type Criterion,
} from './report-charts';

const crit = (name: string, score: number, weight: number, extra: Partial<Criterion> = {}): Criterion =>
  ({ criterion_name: name, score, weight, ...extra });

// --- donut -------------------------------------------------------------------
{
  // 0% must still be a valid path, not NaN, or the PDF renderer throws.
  assert.ok(/^M 50 10 A/.test(donutPath(0, 50, 50, 40)));
  assert.ok(!/NaN/.test(donutPath(0, 50, 50, 40)));
  // 100% cannot close on itself (start == end draws nothing), so it stops short.
  assert.ok(!/NaN/.test(donutPath(100, 50, 50, 40)));
  // Out-of-range input is clamped rather than drawing a wild arc.
  assert.equal(donutPath(-20, 50, 50, 40), donutPath(0, 50, 50, 40));
  assert.equal(donutPath(180, 50, 50, 40), donutPath(100, 50, 50, 40));
  // Half way round ends at the bottom of the circle.
  assert.match(donutPath(50, 50, 50, 40), /A 40 40 0 0 1 50 90$/);
}

// --- radar -------------------------------------------------------------------
{
  const cs = [crit('A', 5, 25), crit('B', 0, 25), crit('C', 3, 25), crit('D', 4, 25)];
  const g = radarGeometry(cs, 200);
  assert.equal(g.points.length, 4);
  assert.equal(g.spokes.length, 4);
  assert.equal(g.rings.length, 4, 'four grid rings');
  assert.ok(!/NaN/.test(g.shape), 'a zero score must not produce NaN');

  // First axis points straight up, so a full score sits at the top of the chart.
  assert.equal(g.points[0].x, 100);
  assert.ok(g.points[0].y < 100, 'score 5 on axis 0 is above centre');

  // A zero score collapses to the exact centre.
  assert.equal(g.points[1].x, 100);
  assert.equal(g.points[1].y, 100);

  // Labels on the right anchor start, on the left anchor end, so long names
  // grow away from the shape instead of across it.
  const right = g.points.find((p) => p.labelX > 100 + 4);
  const left = g.points.find((p) => p.labelX < 100 - 4);
  assert.equal(right?.anchor, 'start');
  assert.equal(left?.anchor, 'end');

  // The pass ring is drawn at 3/5 regardless of what anyone scored.
  const g2 = radarGeometry([crit('A', 0, 50), crit('B', 0, 50), crit('C', 0, 0)], 200);
  assert.equal(g2.passShape, radarGeometry([crit('A', 5, 50), crit('B', 5, 50), crit('C', 5, 0)], 200).passShape);
  assert.equal(CRITERION_PASS, 3);
}

// --- ordering and contribution ----------------------------------------------
{
  const cs = [crit('good', 5, 10), crit('bad', 1, 40), crit('mid', 3, 30), crit('extra', 1, 0, { off_rubric: true })];
  const order = weakestFirst(cs).map((c) => c.criterion_name);
  assert.deepEqual(order, ['bad', 'mid', 'good', 'extra'], 'weakest first, off-rubric last');

  // Contribution is in FINAL POINTS, so the four add up to the overall score.
  const onRubric = cs.filter((c) => !c.off_rubric);
  const total = onRubric.reduce((n, c) => n + c.weight, 0);
  const sum = onRubric.reduce((n, c) => n + contribution(c, total), 0);
  const expected = onRubric.reduce((n, c) => n + (c.score / 5) * c.weight, 0) / total * 100;
  assert.ok(Math.abs(sum - expected) < 0.5, `contributions must sum to the score (${sum} vs ${expected})`);
  assert.equal(contribution(crit('x', 5, 10), 0), 0, 'no divide-by-zero on an empty rubric');
}

// --- bands and ideal ---------------------------------------------------------
{
  assert.equal(scoreBand(70), 'strong');
  assert.equal(scoreBand(69.9), 'ok');
  assert.equal(scoreBand(50), 'ok');
  assert.equal(scoreBand(49.9), 'weak');
  const b = idealBand(35, 45);
  assert.equal(b.left, 35);
  assert.equal(b.width, 10);
}

console.log('report-charts: all checks passed');

// --- pie ---------------------------------------------------------------------
{
  const cs = [crit('A', 5, 50), crit('B', 1, 30), crit('C', 3, 20), crit('extra', 1, 0, { off_rubric: true })];
  const slices = pieSlices(cs, 60, 60, 50, 30);

  assert.equal(slices.length, 3, 'zero-weight extras are dropped, not drawn as slivers');
  assert.ok(!slices.some((s) => /NaN/.test(s.path)));

  // Slice width is the WEIGHT share, which is the point of the chart.
  assert.deepEqual(slices.map((s) => s.share), [50, 30, 20]);
  assert.ok(Math.abs(slices.reduce((n, s) => n + s.share, 0) - 100) < 0.01);

  // Pass colour comes from the criterion, not the slice size.
  assert.deepEqual(slices.map((s) => s.passed), [true, false, true]);

  // A lone criterion is a full ring and must still be a drawable arc.
  const one = pieSlices([crit('only', 4, 100)], 60, 60, 50, 30);
  assert.equal(one.length, 1);
  assert.ok(!/NaN/.test(one[0].path));
  assert.equal(one[0].share, 100);

  // An empty or all-zero rubric draws nothing rather than dividing by zero.
  assert.deepEqual(pieSlices([], 60, 60, 50, 30), []);
  assert.deepEqual(pieSlices([crit('x', 3, 0)], 60, 60, 50, 30), []);
}

console.log('report-charts: pie checks passed');
