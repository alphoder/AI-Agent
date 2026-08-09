/**
 * Chart geometry, as plain numbers.
 *
 * The screen renders with DOM <svg> and the PDF renders with @react-pdf's <Svg>.
 * They are different renderers and cannot share components, but they can share
 * the maths — so a chart is defined once here and drawn twice. If the two ever
 * look different, it is a styling bug, not a data bug.
 *
 * Everything is pure and unit-tested in report-charts.test.ts.
 */

export interface Criterion {
  criterion_name: string;
  score: number;      // 0-5 as the rubric scores it
  weight: number;     // % of the grade
  justification?: string;
  passed?: boolean;
  off_rubric?: boolean;
}

/** A criterion passes at 3 of 5 — the rubric's own middle level. */
export const CRITERION_PASS = 3;

// --- donut -------------------------------------------------------------------

/** SVG arc path for `pct` (0-100) of a ring, starting at 12 o'clock, clockwise. */
export function donutPath(pct: number, cx: number, cy: number, r: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  // A full circle cannot be drawn as one arc (start == end), so stop just short.
  const angle = (Math.min(clamped, 99.999) / 100) * 2 * Math.PI;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const large = angle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${round(x)} ${round(y)}`;
}

// --- radar -------------------------------------------------------------------

export interface RadarPoint { x: number; y: number; labelX: number; labelY: number; label: string; anchor: 'start' | 'middle' | 'end' }
export interface RadarGeometry {
  rings: string[];        // polygon point strings, outermost last
  spokes: { x1: number; y1: number; x2: number; y2: number }[];
  shape: string;          // the learner's polygon
  points: RadarPoint[];
  passShape: string;      // the 3-of-5 pass line, so "am I above the bar" is visible
}

/**
 * A radar of the rubric. This is the one chart that shows the SHAPE of someone's
 * performance rather than a list of numbers: a spike on Discovery with a dent on
 * Closing reads instantly, where five bars do not.
 *
 * Fewer than 3 criteria cannot form a polygon, and the caller should fall back to
 * bars — `points.length < 3` signals that.
 */
export function radarGeometry(
  criteria: Criterion[],
  size: number,
  padding = 34,
): RadarGeometry {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - padding;
  const n = criteria.length;
  const at = (i: number, frac: number) => {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    return { x: round(cx + r * frac * Math.cos(a)), y: round(cy + r * frac * Math.sin(a)) };
  };

  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    criteria.map((_, i) => { const p = at(i, f); return `${p.x},${p.y}`; }).join(' '));

  const spokes = criteria.map((_, i) => {
    const p = at(i, 1);
    return { x1: cx, y1: cy, x2: p.x, y2: p.y };
  });

  const points: RadarPoint[] = criteria.map((c, i) => {
    const frac = Math.max(0, Math.min(1, c.score / 5));
    const p = at(i, frac);
    const lp = at(i, 1.18);
    // Anchor the label away from the centre so long criterion names do not
    // overlap the shape on the left-hand axes.
    const anchor: RadarPoint['anchor'] = lp.x > cx + 4 ? 'start' : lp.x < cx - 4 ? 'end' : 'middle';
    return { x: p.x, y: p.y, labelX: lp.x, labelY: lp.y, label: c.criterion_name, anchor };
  });

  return {
    rings,
    spokes,
    shape: points.map((p) => `${p.x},${p.y}`).join(' '),
    passShape: criteria.map((_, i) => { const p = at(i, CRITERION_PASS / 5); return `${p.x},${p.y}`; }).join(' '),
    points,
  };
}

// --- talk ratio --------------------------------------------------------------

/** Where the ideal band sits on a 0-100 bar, as percentages of the width. */
export function idealBand(lo: number, hi: number) {
  return { left: clamp01(lo / 100) * 100, width: clamp01((hi - lo) / 100) * 100 };
}

// --- shared helpers ----------------------------------------------------------

/** Bucket a 0-100 score. Used for colour in both renderers, so they agree. */
export function scoreBand(score: number): 'strong' | 'ok' | 'weak' {
  if (score >= 70) return 'strong';
  if (score >= 50) return 'ok';
  return 'weak';
}

/** Weakest first: the top of a report is the shortest route to a better score. */
export function weakestFirst(criteria: Criterion[]): Criterion[] {
  return [...criteria].sort(
    (a, b) => Number(a.off_rubric ?? false) - Number(b.off_rubric ?? false)
      || a.score - b.score
      || b.weight - a.weight,
  );
}

/** Criterion contribution to the final 0-100, in points. */
export function contribution(c: Criterion, totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  return round((c.score / 5) * (c.weight / totalWeight) * 100);
}

const round = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// --- pie / donut of the rubric ----------------------------------------------

export interface PieSlice {
  path: string;          // donut segment
  label: string;
  score: number;         // 0-5
  weight: number;        // % of grade
  share: number;         // this slice's share of the ring, 0-100
  passed: boolean;
  /** Mid-angle point on the ring, for a leader dot or an inline figure. */
  midX: number;
  midY: number;
}

/**
 * The rubric as a pie: every slice is as wide as that criterion's WEIGHT, so the
 * ring shows what the grade is actually made of, and each slice is coloured by
 * whether it passed. Criterion names go in a legend beside it rather than around
 * the circle — long names ("Trust-Led Cross-Sell & Next Step") clipped badly on
 * the radar this replaces.
 *
 * Off-rubric extras carry zero weight and are dropped: a zero-width slice is not
 * drawable and they cannot move the grade anyway.
 */
export function pieSlices(
  criteria: Criterion[],
  cx: number,
  cy: number,
  r: number,
  innerR: number,
): PieSlice[] {
  const used = criteria.filter((c) => c.weight > 0);
  const total = used.reduce((n, c) => n + c.weight, 0);
  if (total <= 0) return [];

  let a0 = -Math.PI / 2;              // start at 12 o'clock
  return used.map((c) => {
    const share = (c.weight / total) * 100;
    // A single criterion would be a full circle, which cannot be drawn as one
    // arc (start == end); nudge it closed.
    const sweep = Math.min((c.weight / total) * 2 * Math.PI, 2 * Math.PI - 0.001);
    const a1 = a0 + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${round(cx + rad * Math.cos(ang))},${round(cy + rad * Math.sin(ang))}`;
    const path =
      `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)}` +
      ` L ${p(a1, innerR)} A ${innerR} ${innerR} 0 ${large} 0 ${p(a0, innerR)} Z`;
    const mid = (a0 + a1) / 2;
    const midR = (r + innerR) / 2;
    const slice: PieSlice = {
      path,
      label: c.criterion_name,
      score: c.score,
      weight: c.weight,
      share: round(share),
      passed: c.passed ?? c.score >= CRITERION_PASS,
      midX: round(cx + midR * Math.cos(mid)),
      midY: round(cy + midR * Math.sin(mid)),
    };
    a0 = a1;
    return slice;
  });
}
