/**
 * Turning pixel positions on a play crop into yards. Hudl-style diagrams
 * draw a blue line of scrimmage and light 5-yard lines; when they exist we
 * measure the scale from them. Otherwise the offensive line spacing gives
 * the scale (adjacent linemen ~1.3 yards apart, center to center).
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface Calibration {
  width: number;
  height: number;
  losY: number | null;
  pxPerYard: number | null;
}

const isBlue = (r: number, g: number, b: number) => b > 140 && r < 130 && g < 130;
const isLightGray = (r: number, g: number, b: number) =>
  r > 150 && r < 240 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12;

function clusters(indexes: number[], gap = 3): number[] {
  const out: number[] = [];
  let run: number[] = [];
  for (const i of indexes) {
    if (run.length && i - run[run.length - 1]! > gap) {
      out.push(run.reduce((a, b) => a + b, 0) / run.length);
      run = [];
    }
    run.push(i);
  }
  if (run.length) out.push(run.reduce((a, b) => a + b, 0) / run.length);
  return out;
}

export async function calibrate(png: Uint8Array): Promise<Calibration> {
  const img = await loadImage(Buffer.from(png));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
  };

  let losY: number | null = null;
  let best = 0;
  const grayRows: number[] = [];
  for (let y = 0; y < height; y++) {
    let blue = 0;
    let gray = 0;
    for (let x = 0; x < width; x += 2) {
      const [r, g, b] = at(x, y);
      if (isBlue(r, g, b)) blue++;
      else if (isLightGray(r, g, b)) gray++;
    }
    if (blue > best) {
      best = blue;
      losY = y;
    }
    if (gray > width * 0.3) grayRows.push(y);
  }
  if (best < width * 0.25) losY = null; // no real blue line

  const rows = clusters(grayRows).filter((y) => losY == null || Math.abs(y - losY) > 6);
  const gaps = rows
    .slice(1)
    .map((y, i) => y - rows[i]!)
    .filter((g) => g > 15)
    .sort((a, b) => a - b);
  let pxPerYard: number | null = null;
  if (gaps.length >= 2) {
    const median = gaps[Math.floor(gaps.length / 2)]!;
    // Yard lines are evenly spaced; ignore stray gray rows (handwriting, logos)
    // and trust the scale when most gaps agree with the median.
    const agree = gaps.filter((g) => Math.abs(g / median - 1) < 0.12);
    if (agree.length >= 2 && agree.length >= gaps.length * 0.5) {
      pxPerYard = agree.reduce((a, b) => a + b, 0) / agree.length / 5;
    }
  }
  return { width, height, losY, pxPerYard };
}

export interface PixelPlayer {
  id: string;
  x: number;
  y: number;
}

/**
 * Combine image measurements with what the model located: the ball (center)
 * position always comes from the model's center marker; scale from yard
 * lines, else from line spacing, else a guess from crop width (~40 yards).
 */
export function scaleFor(cal: Calibration, players: PixelPlayer[], ball: { x: number; y: number }) {
  let ppy = cal.pxPerYard;
  if (!ppy) {
    const line = players
      .filter((p) => Math.abs(p.y - ball.y) < cal.height * 0.05)
      .map((p) => p.x)
      .sort((a, b) => a - b);
    const spacing = line.slice(1).map((x, i) => x - line[i]!).filter((d) => d > 2);
    spacing.sort((a, b) => a - b);
    if (spacing.length >= 3) ppy = spacing[Math.floor(spacing.length / 2)]! / 1.3;
  }
  if (!ppy) ppy = cal.width / 40;
  const losY = cal.losY ?? ball.y;
  const toYards = (px: number, py: number): [number, number] => [
    Math.round(((px - ball.x) / ppy!) * 10) / 10,
    Math.round(((losY - py) / ppy!) * 10) / 10,
  ];
  return { pxPerYard: ppy, losY, toYards };
}
