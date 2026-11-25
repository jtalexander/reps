/**
 * The team's wristbands: each call's number (kept from week to week), and
 * named band setups (each coach keeps his own size, look, style and way of
 * calling plays). See domain/wristband.ts and domain/calling.ts.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, type Db } from "@/db";
import { plays, teams } from "@/db/schema";
import { assignNumbers, BandSchema, bandOf, CallingSchema, renumber, setNumber, swapNumbers, WristbandSchema, wristbandFrom, type Band, type Wristband } from "@/domain/wristband";

export async function getWristband(teamId: string, database: Db = db): Promise<Wristband> {
  const [t] = await database.select({ w: teams.wristband }).from(teams).where(eq(teams.id, teamId));
  return wristbandFrom(t?.w);
}

async function save(teamId: string, w: Wristband, database: Db): Promise<Wristband> {
  const v = WristbandSchema.parse(w);
  await database.update(teams).set({ wristband: v }).where(eq(teams.id, teamId));
  return v;
}

const CONCEPT = /^c:[A-Z0-9 #&'/.+-]{1,60}$/i;
const UUID = /^[0-9a-f-]{36}$/i;

/** Keep this team's calls only: its own plays, and concept keys. */
async function ours(teamId: string, keys: string[], database: Db): Promise<string[]> {
  const clean = [...new Set(keys.filter((x) => typeof x === "string" && (UUID.test(x) || CONCEPT.test(x))))];
  const ids = clean.filter((k) => UUID.test(k));
  const ok = new Set<string>(clean.filter((k) => CONCEPT.test(k)));
  if (ids.length) {
    const rows = await database.select({ id: plays.id }).from(plays).where(and(eq(plays.teamId, teamId), inArray(plays.id, ids)));
    for (const r of rows) ok.add(r.id);
  }
  return clean.filter((k) => ok.has(k));
}

/**
 * Numbers per play and numbers per concept are separate sets (a team uses one
 * or the other), so each is numbered on its own: work on one kind, keep the other.
 */
const kindOf = (k: string) => (k.startsWith("c:") ? "c" : "p");
function ofKind(numbers: Record<string, string>, kind: string) {
  const mine: Record<string, string> = {};
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(numbers)) (kindOf(k) === kind ? mine : rest)[k] = v;
  return { mine, rest };
}

/** Calls on a band that have no number get one (kept from then on). */
export async function ensureNumbers(teamId: string, keys: string[], database: Db = db): Promise<Wristband> {
  const w = await getWristband(teamId, database);
  const missing = keys.filter((k) => !w.numbers[k]);
  if (!missing.length) return w;
  const valid = await ours(teamId, missing, database);
  if (!valid.length) return w;
  let numbers = w.numbers;
  for (const kind of ["p", "c"]) {
    const keys = valid.filter((k) => kindOf(k) === kind);
    if (!keys.length) continue;
    const { mine, rest } = ofKind(numbers, kind);
    numbers = { ...rest, ...assignNumbers(mine, keys, w.numbering) };
  }
  return save(teamId, { ...w, numbers }, database);
}

/** Team-wide: how numbers are made, by play or by concept, and the band players learn. */
export async function saveTeamCalling(teamId: string, input: unknown, database: Db = db): Promise<Wristband> {
  const patch = WristbandSchema.pick({ numbering: true, numbersBy: true, teachBand: true }).partial().parse(input);
  const w = await getWristband(teamId, database);
  if (patch.teachBand && !w.bands.some((b) => b.id === patch.teachBand)) throw new Error("That band setup is gone.");
  return save(teamId, { ...w, ...patch }, database);
}

const BandPatch = BandSchema.omit({ id: true, calling: true }).partial().extend({ calling: CallingSchema.optional() });

/** Change one band setup (its look, style or how plays are called with it). */
export async function saveBand(teamId: string, bandId: string, input: unknown, database: Db = db): Promise<Wristband> {
  const patch = BandPatch.parse(input);
  const w = await getWristband(teamId, database);
  const i = w.bands.findIndex((b) => b.id === bandId);
  if (i < 0) throw new Error("That band setup is gone.");
  const band = BandSchema.parse({ ...w.bands[i], ...patch });
  const bands = w.bands.map((b, k) => (k === i ? band : b));
  return save(teamId, { ...w, bands }, database);
}

/** A new band setup, copied from one (or the first). */
export async function createBand(teamId: string, fromId: string | null, name: string, database: Db = db): Promise<{ wristband: Wristband; band: Band }> {
  const n = z.string().trim().min(1).max(40).parse(name);
  const w = await getWristband(teamId, database);
  if (w.bands.length >= 12) throw new Error("That's 12 band setups. Delete one first.");
  const from = bandOf(w, fromId);
  const band = BandSchema.parse({ ...from, id: randomUUID().slice(0, 8), name: n });
  return { wristband: await save(teamId, { ...w, bands: [...w.bands, band] }, database), band };
}

export async function deleteBand(teamId: string, bandId: string, database: Db = db): Promise<Wristband> {
  const w = await getWristband(teamId, database);
  if (w.bands.length <= 1) throw new Error("Keep at least one band setup.");
  const bands = w.bands.filter((b) => b.id !== bandId);
  return save(teamId, { ...w, bands, teachBand: w.teachBand === bandId ? null : w.teachBand }, database);
}

const Num = z.string().trim().max(6).regex(/^[A-Za-z0-9-]*$/, "Use numbers or letters only.");

/** Give a call a number; the call that had it loses it (named back). */
export async function setCallNumber(teamId: string, key: string, value: string, database: Db = db): Promise<{ wristband: Wristband; bumped: string | null }> {
  const v = Num.parse(value);
  const [k] = await ours(teamId, [key], database);
  if (!k) throw new Error("That play is gone.");
  const w = await getWristband(teamId, database);
  const { mine, rest } = ofKind(w.numbers, kindOf(k));
  const r = setNumber(mine, k, v);
  let bumped: string | null = null;
  if (r.bumped) {
    if (r.bumped.startsWith("c:")) bumped = r.bumped.slice(2);
    else {
      const [p] = await database.select({ name: plays.name }).from(plays).where(eq(plays.id, r.bumped));
      bumped = p?.name ?? "another play";
    }
  }
  return { wristband: await save(teamId, { ...w, numbers: { ...rest, ...r.numbers } }, database), bumped };
}

/** Swap two calls' numbers (moves one up or down the band). */
export async function swapCalls(teamId: string, a: string, b: string, database: Db = db): Promise<Wristband> {
  const keys = await ours(teamId, [a, b], database);
  if (keys.length !== 2) throw new Error("That play is gone.");
  const w = await getWristband(teamId, database);
  return save(teamId, { ...w, numbers: swapNumbers(w.numbers, a, b) }, database);
}

/** Number these calls fresh, in this order. */
export async function renumberCalls(teamId: string, keys: string[], numbering?: Wristband["numbering"], database: Db = db): Promise<Wristband> {
  const valid = await ours(teamId, keys, database);
  const order = keys.filter((k) => valid.includes(k));
  const w = await getWristband(teamId, database);
  const how = numbering ?? w.numbering;
  const kind = kindOf(order[0] ?? "");
  const { mine, rest } = ofKind(w.numbers, kind);
  return save(teamId, { ...w, numbering: how, numbers: { ...rest, ...renumber(mine, order.filter((k) => kindOf(k) === kind), how) } }, database);
}

/** A short name for the band ("" goes back to the play's name). */
export async function setCallLabel(teamId: string, key: string, label: string, database: Db = db): Promise<Wristband> {
  const v = z.string().trim().max(40).parse(label);
  const [k] = await ours(teamId, [key], database);
  if (!k) throw new Error("That play is gone.");
  const w = await getWristband(teamId, database);
  const labels = { ...w.labels };
  if (v) labels[k] = v;
  else delete labels[k];
  return save(teamId, { ...w, labels }, database);
}

/** Put a call on a band or leave it off (it stays in the install or plan). */
export async function setOnBand(teamId: string, bandId: string, key: string, on: boolean, database: Db = db): Promise<Wristband> {
  const [k] = await ours(teamId, [key], database);
  if (!k) throw new Error("That play is gone.");
  const w = await getWristband(teamId, database);
  const band = w.bands.find((b) => b.id === bandId);
  if (!band) throw new Error("That band setup is gone.");
  const off = band.off.filter((x) => x !== k);
  return saveBand(teamId, bandId, { off: on ? off : [...off, k] }, database);
}
