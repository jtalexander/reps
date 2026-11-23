/** "VEER RIGHT vs 4-3 Under" -> the play and the front it's drawn against. */
export function splitFront(name: string): { base: string; front: string | null } {
  const m = name.match(/^(.*?)\s+vs\.?\s+(.+)$/i);
  return m ? { base: m[1]!.trim(), front: m[2]!.trim() } : { base: name.trim(), front: null };
}

/**
 * Group plays that are the same play drawn against different fronts (keeps
 * first-seen order). With `page`, only drawings on the same page group: a
 * playbook often draws two versions of a play (say, with and without a tight
 * end) on two pages, each against every front.
 */
export function groupByFront<T extends { name: string; page?: number | null }>(items: T[], on: boolean): Array<{ base: string; items: Array<T & { front: string | null }> }> {
  const out: Array<{ base: string; items: Array<T & { front: string | null }> }> = [];
  const at = new Map<string, number>();
  for (const it of items) {
    const { base, front } = splitFront(it.name);
    const key = on && front ? `${base.toUpperCase()}@${it.page ?? ""}` : `#${out.length}:${it.name}`;
    const i = at.get(key);
    if (i === undefined) {
      at.set(key, out.length);
      out.push({ base: on && front ? base : it.name, items: [{ ...it, front: on ? front : null }] });
    } else out[i]!.items.push({ ...it, front });
  }
  return out;
}
