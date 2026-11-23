/** Width and height from a PNG's header (no image library, so background jobs stay plain JS). */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24 || v.getUint32(0) !== 0x89504e47) throw new Error("Page image isn't a PNG.");
  return { width: v.getUint32(16), height: v.getUint32(20) };
}
