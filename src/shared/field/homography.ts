/**
 * Mapping a picture of the field onto the field itself. Four or more points
 * whose real positions are known (a yard line crossing a hash, a sideline)
 * fix the mapping for every other point on the ground in that picture.
 * Pure math, no dependencies.
 */
export type Vec2 = readonly [number, number];
/** A 3x3 matrix, row by row. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

export interface PointPair {
  from: Vec2;
  to: Vec2;
}

/** Shift and scale points so they sit around the origin about one unit away (keeps the solve stable). */
function normalizer(pts: Vec2[]): { s: number; cx: number; cy: number } {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const mean = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length;
  return { s: mean > 0 ? Math.SQRT2 / mean : 1, cx, cy };
}

/** Solve A x = b by elimination with pivoting; null when the system has no single answer. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) m[r]![k]! -= f * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

const mul = (a: number[], b: number[]): number[] => {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c]! += a[r * 3 + k]! * b[k * 3 + c]!;
  return out;
};

/**
 * The mapping that best carries each `from` point to its `to` point (least
 * squares when there are more than four). Null when the points can't fix it:
 * fewer than four, or all on one line.
 */
export function solveHomography(pairs: PointPair[]): Homography | null {
  if (pairs.length < 4) return null;
  const nf = normalizer(pairs.map((p) => p.from));
  const nt = normalizer(pairs.map((p) => p.to));
  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  const add = (row: number[], rhs: number) => {
    for (let i = 0; i < 8; i++) {
      atb[i]! += row[i]! * rhs;
      for (let j = 0; j < 8; j++) ata[i]![j]! += row[i]! * row[j]!;
    }
  };
  for (const p of pairs) {
    const x = (p.from[0] - nf.cx) * nf.s;
    const y = (p.from[1] - nf.cy) * nf.s;
    const u = (p.to[0] - nt.cx) * nt.s;
    const v = (p.to[1] - nt.cy) * nt.s;
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solve(ata, atb);
  if (!h) return null;
  const hn = [...h, 1];
  const tFrom = [nf.s, 0, -nf.s * nf.cx, 0, nf.s, -nf.s * nf.cy, 0, 0, 1];
  const tToInv = [1 / nt.s, 0, nt.cx, 0, 1 / nt.s, nt.cy, 0, 0, 1];
  const out = mul(mul(tToInv, hn), tFrom);
  if (out.some((v) => !Number.isFinite(v))) return null;
  return out as unknown as Homography;
}

export function applyHomography(h: Homography, p: Vec2): [number, number] {
  const w = h[6] * p[0] + h[7] * p[1] + h[8];
  return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w];
}

/** How far the mapping misses the known points, root mean square, in `to` units. */
export function fitError(h: Homography, pairs: PointPair[]): number {
  if (!pairs.length) return 0;
  const sum = pairs.reduce((a, p) => {
    const [x, y] = applyHomography(h, p.from);
    return a + (x - p.to[0]) ** 2 + (y - p.to[1]) ** 2;
  }, 0);
  return Math.sqrt(sum / pairs.length);
}
