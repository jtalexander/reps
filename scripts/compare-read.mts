/**
 * Compare models on reading the same playbook drawings (saves nothing).
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/compare-read.mts "<team>" [n]
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { plays, teams } from "@/db/schema";
import { namingBrief } from "@/domain/naming";
import { readDrawing, type Drawing } from "@/teach/ai";
import { prepareCrop } from "@/teach/convert";
import { playbookDrawings } from "@/teach/drawings";
import { getNaming } from "@/teach/naming";
import { pngSize } from "@/teach/png";

const [teamName, nArg] = process.argv.slice(2);
const [team] = await db.select().from(teams).where(eq(teams.name, teamName!));
const rows = await db
  .select({ key: sql<string>`${plays.aiRaw}->>'drawingKey'`, kind: plays.playType })
  .from(plays)
  .where(and(eq(plays.teamId, team!.id), isNotNull(sql`${plays.aiRaw}->>'drawingKey'`), eq(plays.archived, false)));
const labels = new Map((await playbookDrawings(team!.id)).map((d) => [d.key, d.label]));
// a mix: formations, runs and passes
const pick = [...rows.filter((r) => r.kind === "unknown").slice(0, 2), ...rows.filter((r) => r.kind === "run").slice(0, 2), ...rows.filter((r) => r.kind === "pass").slice(0, 2)].slice(0, Number(nArg ?? 6));
const { naming } = await getNaming(team!.id);
const brief = namingBrief(naming);
const MODELS: Array<[string, string, number, number]> = [
  // model, label, $ in, $ out per MTok
  ["claude-opus-5-5", "Opus 5.5", 4, 20],
  ["claude-sonnet-5-5", "Sonnet 5.5", 2, 10],
  ["claude-haiku-5-5", "Haiku 5.5", 0.1, 0.5],
];

const agree = (a: Drawing, b: Drawing) => {
  const byId = new Map(b.players.map((p) => [p.id, p]));
  let ids = 0, jobs = 0, routes = 0, routeN = 0, dist = 0;
  for (const p of a.players) {
    const q = byId.get(p.id);
    if (!q) continue;
    ids++;
    if (p.does === q.does) jobs++;
    if (p.route_name || q.route_name) {
      routeN++;
      if ((p.route_name ?? "").toLowerCase() === (q.route_name ?? "").toLowerCase()) routes++;
    }
    dist += Math.hypot(p.at.x - q.at.x, p.at.y - q.at.y);
  }
  const miss = a.players.filter((p) => !byId.has(p.id)).map((p) => p.id).join(",") + " vs " + b.players.filter((p) => !a.players.some((x) => x.id === p.id)).map((p) => p.id).join(",");
  return { miss, ids: `${ids}/${a.players.length}`, jobs: `${jobs}/${ids}`, routes: routeN ? `${routes}/${routeN}` : "-", spot: ids ? (dist / ids).toFixed(1) : "-" };
};

const totals: Record<string, { s: number; usd: number }> = {};
for (const r of pick) {
  const crop = await prepareCrop(team!.id, r.key);
  const { width, height } = pngSize(crop.png);
  const label = labels.get(r.key) ?? "";
  const out: Record<string, { d: Drawing; s: number }> = {};
  await Promise.all(
    MODELS.map(async ([m]) => {
      const t0 = Date.now();
      const d = await readDrawing(crop.png, width, height, label, "", brief, { model: m });
      out[m] = { d, s: (Date.now() - t0) / 1000 };
    }),
  );
  const base = out["claude-opus-5-5"]!.d;
  console.log(`\n${label}  (${r.kind})`);
  for (const [m, name] of MODELS) {
    const o = out[m]!;
    totals[name] = { s: (totals[name]?.s ?? 0) + o.s, usd: 0 };
    const a = m === "claude-opus-5-5" ? null : agree(base, o.d);
    console.log(`  ${name.padEnd(11)} ${o.s.toFixed(0).padStart(3)}s  players ${o.d.players.length}  ${a ? `same letters ${a.ids}${a.miss !== " vs " ? ` [${a.miss}]` : ""}  same job ${a.jobs}  same route ${a.routes}  spot off ${a.spot} yd` : "(baseline)"}`);
  }
}
console.log("\naverage seconds:", Object.entries(totals).map(([k, v]) => `${k} ${(v.s / pick.length).toFixed(0)}s`).join(", "));
process.exit(0);
