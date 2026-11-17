/**
 * Reading a playbook PDF: page count, page renders, and the text layer with
 * positions. Everything here works in PDF points (1/72 in) with the origin at
 * the top-left of the page, so crop boxes and text share one coordinate space.
 */
import { createCanvas } from "@napi-rs/canvas";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjs: PdfJs | null = null;
async function lib(): Promise<PdfJs> {
  if (!pdfjs) pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

async function open(bytes: Uint8Array) {
  const { getDocument } = await lib();
  // A fresh buffer: Node Buffers share a pool and cannot be transferred to the worker port.
  return getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true }).promise;
}

export interface PageSize {
  width: number;
  height: number;
}

export async function pdfInfo(bytes: Uint8Array): Promise<{ pages: PageSize[] }> {
  const doc = await open(bytes);
  try {
    const pages: PageSize[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
      pages.push({ width: vp.width, height: vp.height });
    }
    return { pages };
  } finally {
    await doc.cleanup?.();
  }
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderedPage {
  pageNo: number;
  /** page size in points */
  width: number;
  height: number;
  /** pixels per point of the render */
  scale: number;
  png: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  /** grayscale pixels (0 black - 255 white), row-major, at the render scale */
  gray: Uint8Array;
  text: TextItem[];
}

/** Render one page (1-based) at `dpi`, with its text layer. */
export async function renderPage(
  bytes: Uint8Array,
  pageNo: number,
  dpi = 144,
): Promise<RenderedPage> {
  const doc = await open(bytes);
  try {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      gray[j] = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    }

    const content = await page.getTextContent();
    const text: TextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , d, e, f] = item.transform as number[];
      const h = Math.abs(d ?? item.height) || item.height;
      // PDF space is bottom-left; flip to top-left.
      text.push({ str: item.str, x: e!, y: base.height - f! - h, w: item.width, h });
    }

    return {
      pageNo,
      width: base.width,
      height: base.height,
      scale,
      png: new Uint8Array(canvas.toBuffer("image/png")),
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      gray,
      text,
    };
  } finally {
    await doc.cleanup?.();
  }
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Crop a rendered page to a box given in points; returns a PNG. */
export async function cropPng(page: RenderedPage, box: Box, pad = 4): Promise<{
  png: Uint8Array;
  width: number;
  height: number;
}> {
  const { loadImage } = await import("@napi-rs/canvas");
  const img = await loadImage(Buffer.from(page.png));
  const s = page.scale;
  const x = Math.max(0, Math.round((box.x - pad) * s));
  const y = Math.max(0, Math.round((box.y - pad) * s));
  const w = Math.min(page.pixelWidth - x, Math.round((box.w + pad * 2) * s));
  const h = Math.min(page.pixelHeight - y, Math.round((box.h + pad * 2) * s));
  const crop = createCanvas(w, h);
  crop.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
  return { png: new Uint8Array(crop.toBuffer("image/png")), width: w, height: h };
}

/** Field markings printed as text: yard numbers (10-50) and goal-line G. */
const FIELD_MARKING = /^\s*(?:[1-5]0|G)\s*$/;

/** The text that falls inside a box, top-to-bottom then left-to-right. */
export function textIn(items: TextItem[], box: Box): string {
  const inside = items.filter((t) => {
    if (FIELD_MARKING.test(t.str)) return false;
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  });
  inside.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
  const lines: string[] = [];
  let lastY = -Infinity;
  for (const t of inside) {
    if (Math.abs(t.y - lastY) > 3) lines.push(t.str.trim());
    else lines[lines.length - 1] += " " + t.str.trim();
    lastY = t.y;
  }
  return lines.join("\n").trim();
}
