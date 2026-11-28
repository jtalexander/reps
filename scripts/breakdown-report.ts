/**
 * Breakdown milestone 0 report: how the formation rules did on hand-marked
 * frames, one field at a time, and how much position error they can take.
 *
 *   pnpm tsx scripts/breakdown-report.ts marked-frames-2026-11-28.json
 *
 * The file comes from "Save to a file" on /t/<team>/film/mark.
 */
import { readFileSync } from "node:fs";
import { answers, FIELD_LABEL, FIELDS, readPlayers, score, sensitivity } from "../src/breakdown/marking/evaluate";
import { MarkFileSchema, solveFrame } from "../src/breakdown/marking/types";

const path = process.argv[2];
if (!path) {
  console.error("Usage: pnpm tsx scripts/breakdown-report.ts <marked-frames.json>");
  process.exit(1);
}
const file = MarkFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
const report = score(file.frames, file.field, file.formations);

console.log(`\n${report.frames} frames, ${report.unsolved.length} not finished marking`);
for (const u of report.unsolved) console.log(`  ${u.frame}: ${u.reason}`);

console.log("\nAccuracy by field (only frames a person answered)");
for (const f of report.fields) {
  const n = f.right + f.wrong;
  const pct = n ? `${Math.round((f.right / n) * 100)}%` : "n/a";
  console.log(`  ${FIELD_LABEL[f.field].padEnd(20)} ${String(f.right).padStart(3)} of ${String(n).padEnd(3)} ${pct.padStart(5)}   (${f.unverified} not answered)`);
}

console.log("\nMisses");
let any = false;
for (const f of report.fields)
  for (const m of f.misses) {
    any = true;
    console.log(`  ${m.frame} · ${FIELD_LABEL[f.field]}: rules said "${m.got ?? "nothing"}", right answer "${m.expected}" (rules were ${Math.round(m.confidence * 100)}% sure)`);
  }
if (!any) console.log("  none");

const lineups = file.frames.flatMap((fr) => {
  const s = solveFrame(fr, file.field);
  return s.ok && s.offense.length ? [s.offense] : [];
});
if (lineups.length) {
  console.log("\nWhat the rules read on each frame");
  file.frames.forEach((fr, i) => {
    const s = solveFrame(fr, file.field);
    if (!s.ok || !s.offense.length) return;
    const a = answers(readPlayers(s.offense, file.formations));
    console.log(`  ${(fr.label || `Frame ${i + 1}`).padEnd(24)} ${FIELDS.map((f) => a[f] ?? "-").join(" | ")}   [fit ${s.fitError.toFixed(2)} yd, ${s.spot.yard_line}, ${s.spot.hash} hash]`);
  });

  console.log("\nIf player positions were off by this much, how often the answer stays the same");
  console.log("(side-to-side error / along-the-field error, in yards; 200 tries per frame)");
  const levels = [
    { sigmaX: 0.25, sigmaY: 0.25 },
    { sigmaX: 0.5, sigmaY: 0.5 },
    { sigmaX: 1, sigmaY: 0.5 },
    { sigmaX: 1, sigmaY: 1 },
    { sigmaX: 2, sigmaY: 0.5 },
    { sigmaX: 2, sigmaY: 1 },
    { sigmaX: 3, sigmaY: 1 },
  ];
  console.log(`  ${"error".padEnd(12)} ${FIELDS.map((f) => f.padStart(10)).join("")}`);
  for (const r of sensitivity(lineups, file.formations, levels)) {
    console.log(`  ${`${r.sigmaX} / ${r.sigmaY}`.padEnd(12)} ${FIELDS.map((f) => `${Math.round(r.held[f] * 100)}%`.padStart(10)).join("")}`);
  }
}
console.log("");
