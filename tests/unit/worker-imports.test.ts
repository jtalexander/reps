/**
 * Netlify's background functions run outside Next.js, where importing
 * "server-only" throws before anything runs: every queued job then sits
 * forever. Follow each function's imports and make sure none gets there.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const FN_DIR = path.join(root, "netlify/functions");

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts")]) if (existsSync(c) && !c.endsWith(path.sep) && /\.(m?ts|tsx)$/.test(c)) return c;
  return null;
}

/** Runtime imports only: "import type" and "export type" vanish when built. */
function imports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm)) if (!m[1]) out.push(m[2]!);
  return out;
}

function chainTo(entry: string, bad: string): string[] | null {
  const seen = new Set<string>();
  const walk = (file: string, trail: string[]): string[] | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    for (const spec of imports(file)) {
      if (spec === bad) return [...trail, path.relative(root, file)];
      const next = resolve(file, spec);
      if (next) {
        const hit = walk(next, [...trail, path.relative(root, file)]);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(entry, []);
}

describe("background functions", () => {
  const fns = readdirSync(FN_DIR).filter((f) => /\.m?ts$/.test(f));
  it("has functions to check", () => expect(fns.length).toBeGreaterThan(0));
  for (const f of fns)
    it(`${f} never imports server-only`, () => {
      expect(chainTo(path.join(FN_DIR, f), "server-only")).toBeNull();
    });
});
