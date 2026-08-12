/**
 * Optional SHA-256 — 12 §41.
 *
 * "Never fabricate checksum" is the whole rule. When Web Crypto is unavailable
 * (an insecure origin, or an old runtime) this returns `null` and the manifest
 * omits the field, rather than emitting a hash of something else or a
 * placeholder that would later be compared against a real digest and "fail".
 */

export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;

  try {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    const digest = await subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}
