/**
 * The Football basics library is hand-written content: these checks keep every
 * topic well formed (ids, answers, styles, audiences, levels, diagrams).
 */
import { describe, expect, it } from "vitest";
import { LEVELS } from "@/domain/readiness";
import { LIBRARY } from "@/library";
import type { Diagram, LibTopic } from "@/library/types";
import { AUDIENCES, QuestionDataSchema } from "@/teach/types";

const levelIdx = (l: string) => LEVELS.indexOf(l as (typeof LEVELS)[number]);

function checkDiagram(where: string, d: Diagram | undefined) {
  if (!d) return;
  expect(d.dots.length, `${where}: diagram has players`).toBeGreaterThan(0);
  for (const p of [...d.dots.map((p) => [p.x, p.y]), ...(d.lines ?? []).flatMap((l) => l.pts), ...(d.zones ?? []).map((z) => [z.x, z.y])] as number[][]) {
    expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${where}: finite coordinates`).toBe(true);
    expect(Math.abs(p[0]!) <= 30 && Math.abs(p[1]!) <= 40, `${where}: inside the field window`).toBe(true);
  }
  for (const l of d.lines ?? []) expect(l.pts.length, `${where}: lines need 2+ points`).toBeGreaterThanOrEqual(2);
}

describe("football basics library", () => {
  it("has unique keys and topic names", () => {
    const keys = LIBRARY.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const names = LIBRARY.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(LIBRARY.map((t) => [t.key, t] as [string, LibTopic]))("%s is well formed", (_k, t) => {
    expect(t.key).toMatch(/^[a-z0-9_]+$/);
    expect(t.version).toBeGreaterThanOrEqual(1);
    expect(levelIdx(t.level)).toBeGreaterThanOrEqual(0);
    expect(t.lessons.length).toBeGreaterThanOrEqual(1);
    expect(t.questions.length).toBeGreaterThanOrEqual(4);
    expect(t.questions.filter((q) => q.core).length, "some core questions").toBeGreaterThanOrEqual(2);
    for (const a of t.for) expect(AUDIENCES).toContain(a);

    const styles = new Map((t.styles ?? []).map((s) => [s.key, new Set(s.options.map((o) => o.key))]));
    for (const s of t.styles ?? []) expect(s.options.length).toBeGreaterThanOrEqual(2);
    const checkCommon = (where: string, x: { minLevel?: string; style?: string; diagram?: Diagram }) => {
      if (x.minLevel) expect(levelIdx(x.minLevel), `${where}: level`).toBeGreaterThanOrEqual(levelIdx(t.level));
      if (x.style) {
        const [k, o] = x.style.split(":");
        expect(styles.get(k!)?.has(o!), `${where}: style ${x.style} is declared`).toBe(true);
      }
      checkDiagram(where, x.diagram);
    };

    for (const l of t.lessons) {
      const where = `${t.key} lesson "${l.title}"`;
      expect(AUDIENCES, where).toContain(l.audience);
      expect(l.body.length, where).toBeGreaterThan(40);
      checkCommon(where, l);
    }
    const prompts = new Set<string>();
    for (const q of t.questions) {
      const where = `${t.key} question "${q.prompt}"`;
      expect(prompts.has(q.prompt), `${where}: duplicate prompt`).toBe(false);
      prompts.add(q.prompt);
      for (const a of q.audience) expect(AUDIENCES, where).toContain(a);
      expect(QuestionDataSchema.safeParse(q.data).success, where).toBe(true);
      expect(q.explanation.length, where).toBeGreaterThan(5);
      if (q.data.kind === "choice") {
        const ids = q.data.choices.map((c) => c.id);
        expect(ids, where).toContain(q.data.answer);
        expect(new Set(q.data.choices.map((c) => c.text.toLowerCase())).size, `${where}: distinct choices`).toBe(ids.length);
      }
      if (q.data.kind === "order") expect(new Set(q.data.items).size, `${where}: distinct items`).toBe(q.data.items.length);
      checkCommon(where, q);
    }
    // each style option has something of its own
    for (const s of t.styles ?? [])
      for (const o of s.options) {
        const tag = `${s.key}:${o.key}`;
        expect([...t.lessons, ...t.questions].some((x) => x.style === tag), `${t.key}: style ${tag} has content`).toBe(true);
      }
  });

  it("covers offense, defense and special teams, concepts and technique", () => {
    const has = (side: string, cat?: string) => LIBRARY.some((t) => t.side === side && (!cat || t.category === cat));
    expect(has("offense", "concepts") && has("offense", "technique")).toBe(true);
    expect(has("defense", "concepts") && has("defense", "technique")).toBe(true);
    expect(has("special")).toBe(true);
  });
});
