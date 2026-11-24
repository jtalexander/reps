/** Position groups used for study-set targeting. */
export const POSITION_GROUPS: Record<string, string[]> = {
  QB: ["QB", "Q"],
  RB: ["RB", "FB", "TB", "HB", "F", "B", "R"],
  WR: ["X", "Z", "H", "WR", "SL", "A"],
  TE: ["Y", "TE"],
  OL: ["LT", "LG", "C", "RG", "RT", "OL", "T", "G"],
  DL: ["DL", "DE", "DT", "NT", "NG", "N", "E", "END", "EDGE", "TACKLE"],
  LB: ["LB", "MLB", "ILB", "OLB", "MIKE", "MIK", "WILL", "SAM", "M", "W", "BUCK", "BACKER"],
  DB: ["DB", "CB", "FS", "SS", "S", "SAF", "SAFETY", "CORNER", "NB", "NICKEL", "STAR", "ROVER", "SPUR"],
  SP: ["K", "P", "PK", "LS", "KS", "KICKER", "PUNTER", "SNAPPER"],
};

export function inGroups(position: string, groups: string[]): boolean {
  if (groups.length === 0) return true;
  const p = position.toUpperCase();
  return groups.some((g) => g === p || (POSITION_GROUPS[g] ?? []).includes(p));
}
