/**
 * Dev check: crop real playbook cards and print the calibration (line of
 * scrimmage row, pixels per yard). Writes the crops so they can be eyeballed.
 * Usage: pnpm tsx scripts/check-calibration.ts <file.pdf> <page> <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { calibrate } from "../src/ingest/calibrate";
import { detectBoxes } from "../src/ingest/boxes";
import { cropPng, renderPage } from "../src/ingest/pdf";

async function main() {
  const [file, pageNo, out] = process.argv.slice(2);
  mkdirSync(out!, { recursive: true });
  const page = await renderPage(new Uint8Array(readFileSync(file!)), Number(pageNo), 144);
  const boxes = detectBoxes(page.gray, page.pixelWidth, page.pixelHeight, page.scale);
  for (const [i, b] of boxes.entries()) {
    const crop = await cropPng(page, b);
    writeFileSync(path.join(out!, `crop-${pageNo}-${i}.png`), crop.png);
    const cal = await calibrate(crop.png);
    console.log(`box ${i}: ${crop.width}x${crop.height}px  losY=${cal.losY}  pxPerYard=${cal.pxPerYard?.toFixed(2)}`);
  }
}
main();
