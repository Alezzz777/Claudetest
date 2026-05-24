export type ParsedDataUrl = { mime: string; base64: string; bytes: Uint8Array<ArrayBuffer> };

export function parseDataUrl(s: string): ParsedDataUrl {
  const m = /^data:([^;]+);base64,(.*)$/.exec(s);
  if (!m) throw new Error("Invalid data URL");
  const mime = m[1];
  const base64 = m[2];
  const buf = Buffer.from(base64, "base64");
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return { mime, base64, bytes: out };
}

export function bufferToDataUrl(mime: string, buf: Buffer | Uint8Array) {
  const b64 = Buffer.from(buf).toString("base64");
  return `data:${mime};base64,${b64}`;
}
