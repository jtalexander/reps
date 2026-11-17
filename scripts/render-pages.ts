/**
 * Dev helper: render pages of a PDF to PNGs and print detected play boxes.
 * Usage: pnpm tsx scripts/render-pages.ts <file.pdf> <outDir> [pages e.g. 1-5]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pdfInfo, renderPage, cropPng, textIn } from "../src/ingest/pdf";
import { detectBoxes } from "../src/ingest/boxes";

async function main() {
  const [file, out, range] = process.argv.slice(2);
  if (!file || !out) throw new Error("usage: render-pages <file.pdf> <outDir> [a-b]");
  mkdirSync(out, { recursive: true });
  const bytes = new Uint8Array(readFileSync(file));
  const { pages } = await pdfInfo(bytes);
  const [a, b] = (range ?? `1-${pages.length}`).split("-").map(Number);
  console.log(`${pages.length} pages, ${pages[0]!.width}x${pages[0]!.height}pt`);
  for (let p = a!; p <= (b ?? a!); p++) {
    const page = await renderPage(bytes, p, 72);
    const boxes = detectBoxes(page.gray, page.pixelWidth, page.pixelHeight, page.scale);
    writeFileSync(path.join(out, `p${p}.png`), page.png);
    console.log(
      `p${p}: ${boxes.length} boxes ` +
        boxes.map((x) => `[${x.x.toFixed(0)},${x.y.toFixed(0)} ${x.w.toFixed(0)}x${x.h.toFixed(0)}]`).join(" "),
    );
    for (const [i, box] of boxes.entries()) {
      const t = textIn(page.text, box).replace(/\n/g, " | ");
      if (t) console.log(`   ${i}: ${t.slice(0, 100)}`);
      if (process.env.CROPS) {
        const c = await cropPng(page, box);
        writeFileSync(path.join(out, `p${p}-${i}.png`), c.png);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
