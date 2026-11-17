/**
 * File storage: Netlify Blobs in production, a local `.media/` folder in
 * development and tests. Keys are team-scoped paths: `<teamId>/...`.
 */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export interface MediaStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  remove(key: string): Promise<void>;
}

const TYPES: Record<string, string> = { ".png": "image/png", ".pdf": "application/pdf", ".jpg": "image/jpeg" };

function fsStore(root = process.env.MEDIA_DIR ?? ".media"): MediaStore {
  const full = (key: string) => {
    const p = path.resolve(/*turbopackIgnore: true*/ root, key);
    if (!p.startsWith(path.resolve(/*turbopackIgnore: true*/ root))) throw new Error("bad media key");
    return p;
  };
  return {
    async put(key, bytes) {
      await mkdir(path.dirname(full(key)), { recursive: true });
      await writeFile(full(key), bytes);
    },
    async get(key) {
      try {
        const bytes = new Uint8Array(await readFile(full(key)));
        return { bytes, contentType: TYPES[path.extname(key)] ?? "application/octet-stream" };
      } catch {
        return null;
      }
    },
    async remove(key) {
      await unlink(full(key)).catch(() => undefined);
    },
  };
}

function blobStore(): MediaStore {
  const load = async () => (await import("@netlify/blobs")).getStore({ name: "reps-media", consistency: "strong" });
  return {
    async put(key, bytes, contentType) {
      const s = await load();
      await s.set(key, new Blob([Buffer.from(bytes)]), { metadata: { contentType } });
    },
    async get(key) {
      const s = await load();
      const r = await s.getWithMetadata(key, { type: "arrayBuffer" });
      if (!r) return null;
      return { bytes: new Uint8Array(r.data), contentType: String(r.metadata?.contentType ?? "application/octet-stream") };
    },
    async remove(key) {
      const s = await load();
      await s.delete(key);
    },
  };
}

let store: MediaStore | null = null;
export function media(): MediaStore {
  if (!store) store = process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT ? blobStore() : fsStore();
  return store;
}
export function setMediaStore(s: MediaStore) {
  store = s;
}
