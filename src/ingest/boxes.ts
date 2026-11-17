/**
 * Finding play boxes on a rendered playbook page. Pure: grayscale pixels in,
 * boxes in PDF points out.
 *
 * Method: recursive XY-cut. A gutter is a run of near-empty rows (or
 * columns); the page is split at gutters, alternating direction, until no
 * piece splits further. Bordered cards (Hudl) never split inside because the
 * border spans them. Pieces too small to be a play (page numbers, footers,
 * a stray title line) are merged into their neighbor or dropped.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Region {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

const INK = 235;

export function detectBoxes(
  gray: Uint8Array,
  width: number,
  height: number,
  scale: number,
): Box[] {
  const frames = detectFrames(gray, width, height, scale);
  if (frames.length) return frames;
  return xyCut(gray, width, height, scale);
}

/**
 * Bordered cards: a frame is a pair of long vertical border lines covering
 * the same rows. The card's title usually sits just above its frame (Hudl
 * prints) or inside it (hand-labeled cards); ink directly above a frame, up
 * to the previous frame or ~40pt, joins the box.
 */
export function detectFrames(
  gray: Uint8Array,
  width: number,
  height: number,
  scale: number,
): Box[] {
  const ink = (x: number, y: number) => gray[y * width + x]! < INK;
  const minLen = Math.round(height * 0.1);
  const tol = Math.max(2, Math.round(2 * scale));

  // vertical runs per column, then merge neighbouring columns (thick borders)
  type Seg = { x: number; y0: number; y1: number };
  const segs: Seg[] = [];
  for (let x = 0; x < width; x++) {
    let start = -1;
    let gap = 0;
    for (let y = 0; y <= height; y++) {
      const on = y < height && ink(x, y);
      if (on) {
        if (start < 0) start = y;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap > 1 || y === height) {
          const end = y - gap + 1;
          if (end - start >= minLen) segs.push({ x, y0: start, y1: end });
          start = -1;
          gap = 0;
        }
      }
    }
  }
  const lines: Seg[] = [];
  for (const s of segs.sort((a, b) => a.y0 - b.y0 || a.x - b.x)) {
    const near = lines.find(
      (l) => Math.abs(l.x - s.x) <= tol && Math.abs(l.y0 - s.y0) <= tol && Math.abs(l.y1 - s.y1) <= tol,
    );
    if (!near) lines.push({ ...s });
  }

  // pair left/right borders with matching rows; a frame must be wide enough
  const minW = width * 0.14;
  const used = new Set<Seg>();
  const frames: Region[] = [];
  const byX = [...lines].sort((a, b) => a.x - b.x);
  for (const left of byX) {
    if (used.has(left)) continue;
    const right = byX
      .filter(
        (r) =>
          !used.has(r) &&
          r.x - left.x >= minW &&
          Math.abs(r.y0 - left.y0) <= tol * 2 &&
          Math.abs(r.y1 - left.y1) <= tol * 2,
      )
      .sort((a, b) => a.x - b.x)[0];
    if (!right) continue;
    // both borders need a top edge: a dark row from left to right at y0
    let edge = 0;
    for (let x = left.x; x <= right.x; x++) if (ink(x, left.y0) || ink(x, left.y0 + 1)) edge++;
    if (edge < (right.x - left.x) * 0.9) continue;
    used.add(left);
    used.add(right);
    // skip any border line that sits inside this frame (yard markers, etc.)
    for (const l of byX) if (l.x > left.x && l.x < right.x && l.y0 >= left.y0 - tol && l.y1 <= left.y1 + tol) used.add(l);
    frames.push({ x0: left.x, y0: Math.min(left.y0, right.y0), x1: right.x + 1, y1: Math.max(left.y1, right.y1) });
  }
  if (frames.length === 0) return [];

  // extend each frame upward over its title
  const maxTitle = Math.round(40 * scale);
  for (const f of frames) {
    const ceiling = Math.max(
      0,
      ...frames
        .filter((o) => o !== f && o.y1 <= f.y0 && o.x0 < f.x1 && o.x1 > f.x0)
        .map((o) => o.y1 + 1),
      f.y0 - maxTitle,
    );
    let top = f.y0;
    let blank = 0;
    for (let y = f.y0 - 1; y >= ceiling; y--) {
      let any = false;
      for (let x = f.x0; x < f.x1 && !any; x++) if (ink(x, y)) any = true;
      if (any) {
        top = y;
        blank = 0;
      } else if (++blank > Math.round(10 * scale)) break;
    }
    f.y0 = top;
  }

  return sortReadingOrder(
    frames.map((r) => ({ x: r.x0 / scale, y: r.y0 / scale, w: (r.x1 - r.x0) / scale, h: (r.y1 - r.y0) / scale })),
  );
}

function xyCut(gray: Uint8Array, width: number, height: number, scale: number): Box[] {
  const ink = (x: number, y: number) => gray[y * width + x]! < INK;
  const minGap = Math.max(3, Math.round(6 * scale)); // 6pt of white
  const minW = width * 0.14;
  const minH = height * 0.08;

  function profile(r: Region, axis: "rows" | "cols"): number[] {
    const out: number[] = [];
    if (axis === "rows") {
      for (let y = r.y0; y < r.y1; y++) {
        let n = 0;
        for (let x = r.x0; x < r.x1; x++) if (ink(x, y)) n++;
        out.push(n);
      }
    } else {
      for (let x = r.x0; x < r.x1; x++) {
        let n = 0;
        for (let y = r.y0; y < r.y1; y++) if (ink(x, y)) n++;
        out.push(n);
      }
    }
    return out;
  }

  /** Split a region along one axis at gutters; returns the inked spans. */
  function spans(r: Region, axis: "rows" | "cols"): Array<[number, number]> {
    const prof = profile(r, axis);
    const span = axis === "rows" ? r.x1 - r.x0 : r.y1 - r.y0;
    const tol = Math.max(1, span * 0.004);
    const out: Array<[number, number]> = [];
    let start = -1;
    let blank = 0;
    for (let i = 0; i < prof.length; i++) {
      if (prof[i]! > tol) {
        if (start < 0) start = i;
        blank = 0;
      } else if (start >= 0) {
        blank++;
        if (blank >= minGap) {
          out.push([start, i - blank + 1]);
          start = -1;
          blank = 0;
        }
      }
    }
    if (start >= 0) out.push([start, prof.length - blank]);
    const base = axis === "rows" ? r.y0 : r.x0;
    return out.map(([a, b]) => [a + base, b + base]);
  }

  /** Merge spans too small to stand alone into the nearest neighbor. */
  function mergeSmall(list: Array<[number, number]>, min: number): Array<[number, number]> {
    const s = list.map((x) => [...x] as [number, number]);
    let changed = true;
    while (changed && s.length > 1) {
      changed = false;
      for (let i = 0; i < s.length; i++) {
        const [a, b] = s[i]!;
        if (b - a >= min) continue;
        const prev = s[i - 1];
        const next = s[i + 1];
        const gapPrev = prev ? a - prev[1] : Infinity;
        const gapNext = next ? next[0] - b : Infinity;
        // Only merge across a narrow gap: a title line above its own diagram.
        // A lone page number far from everything is dropped later instead.
        const near = Math.min(gapPrev, gapNext);
        if (near > min) continue;
        if (gapPrev <= gapNext && prev) prev[1] = b;
        else if (next) next[0] = a;
        s.splice(i, 1);
        changed = true;
        break;
      }
    }
    return s;
  }

  const leaves: Region[] = [];
  function cut(r: Region, axis: "rows" | "cols", depth: number, triedOther: boolean) {
    const min = axis === "rows" ? minH : minW;
    let parts = spans(r, axis);
    parts = mergeSmall(parts, min * 0.6);
    if (parts.length <= 1 || depth > 8) {
      const tight: Region =
        parts.length === 1
          ? axis === "rows"
            ? { ...r, y0: parts[0]![0], y1: parts[0]![1] }
            : { ...r, x0: parts[0]![0], x1: parts[0]![1] }
          : r;
      if (!triedOther && parts.length === 1) {
        cut(tight, axis === "rows" ? "cols" : "rows", depth + 1, true);
      } else if (parts.length === 1) {
        leaves.push(tight);
      }
      return;
    }
    for (const [a, b] of parts) {
      const sub: Region = axis === "rows" ? { ...r, y0: a, y1: b } : { ...r, x0: a, x1: b };
      cut(sub, axis === "rows" ? "cols" : "rows", depth + 1, false);
    }
  }

  cut({ x0: 0, y0: 0, x1: width, y1: height }, "rows", 0, false);

  const boxes = leaves
    .filter((r) => r.x1 - r.x0 >= minW && r.y1 - r.y0 >= minH)
    .map((r) => ({
      x: r.x0 / scale,
      y: r.y0 / scale,
      w: (r.x1 - r.x0) / scale,
      h: (r.y1 - r.y0) / scale,
    }));
  return sortReadingOrder(boxes);
}

/** Rows top to bottom, left to right within a row. */
export function sortReadingOrder(boxes: Box[]): Box[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  const rows: Box[][] = [];
  for (const b of sorted) {
    const row = rows.find((r) => Math.abs(r[0]!.y - b.y) < Math.min(r[0]!.h, b.h) * 0.4);
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

/** Even grid boxes for a page, used when the coach picks a layout by hand. */
export function gridBoxes(
  page: { width: number; height: number },
  cols: number,
  rows: number,
  margin = 18,
  gap = 10,
): Box[] {
  const w = (page.width - margin * 2 - gap * (cols - 1)) / cols;
  const h = (page.height - margin * 2 - gap * (rows - 1)) / rows;
  const out: Box[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: margin + c * (w + gap), y: margin + r * (h + gap), w, h });
  return out;
}
