/** Position groups used for study-set targeting. */
export const POSITION_GROUPS: Record<string, string[]> = {
  QB: ["QB", "Q"],
  RB: ["RB", "FB", "TB", "HB", "F", "B", "R"],
  WR: ["X", "Z", "H", "WR", "SL", "A"],
  TE: ["Y", "TE"],
  OL: ["LT", "LG", "C", "RG", "RT", "OL", "T", "G"],
};

export function inGroups(position: string, groups: string[]): boolean {
  if (groups.length === 0) return true;
  const p = position.toUpperCase();
  return groups.some((g) => g === p || (POSITION_GROUPS[g] ?? []).includes(p));
}
