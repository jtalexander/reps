import { describe, expect, it } from "vitest";
import type { Naming } from "@/domain/naming";
import type { Drawing } from "@/teach/drawings";
import { formationCall, readAheadList } from "@/teach/read-ahead";

const w = (word: string) => ({ word, means: "", pages: [] });
const naming: Naming = {
  positions: [],
  direction: { words: [], rule: "" },
  call_order: [],
  formations: ["SPREAD", "SLOT", "TRIPS", "PRO", "FULL HOUSE"].map(w),
  formation_tags: ["STACK", "BUNCH", "ZIP", "Z", "FIT", "HAZ"].map(w),
  backfields: [],
  motions: [],
  plays: ["VEER", "SMASH", "POWER"].map(w),
  other: [],
  fronts: [],
  coverages: [],
  stunts: [],
  blitzes: [],
};
const d = (key: string, label: string, inInstall = false) => ({ key, label, inInstall, pageNo: 1 }) as unknown as Drawing;

describe("reading the playbook ahead of time", () => {
  it("knows a formation drawing from a play or a motion call", () => {
    expect(formationCall("TRIPS RIGHT STACK", naming)).toBe("TRIPS STACK");
    expect(formationCall("FULL HOUSE RIGHT (Full House Personnel)", naming)).toBe("FULL HOUSE");
    expect(formationCall("TRIPS RIGHT vs 4-3 front alignment rules", naming)).toBeNull(); // a page title
    expect(formationCall("FULL HOUSE LEFT", naming)).toBe("FULL HOUSE");
    expect(formationCall("FIT - SPREAD RIGHT HAZ", naming)).toBe("SPREAD FIT HAZ");
    expect(formationCall("PRO RIGHT Z", naming)).toBe("PRO Z");
    expect(formationCall("SPREAD RIGHT, SMASH", naming)).toBeNull(); // a play
    expect(formationCall("SLOT RIGHT, H-10", naming)).toBeNull(); // a motion call
    expect(formationCall("Two receiver rules", naming)).toBeNull();
  });

  it("reads one drawing per formation (the right side first), then the install, never one already read", () => {
    const drawings = [
      d("1.a", "TRIPS LEFT STACK"),
      d("1.b", "TRIPS RIGHT STACK"),
      d("2.a", "SPREAD RIGHT"),
      d("3.a", "SLOT RIGHT ZIP"),
      d("4.a", "SPREAD RIGHT, SMASH", true),
      d("5.a", "PRO RIGHT"),
    ];
    const list = readAheadList(drawings, naming, new Set(["3.a"]), new Set(["PRO"]));
    expect(list.map((x) => x.key)).toEqual(["1.b", "2.a", "4.a"]);
  });
});
