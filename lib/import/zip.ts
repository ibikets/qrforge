import { crc32 as zcrc32, inflateRawSync } from "node:zlib";

/** Minimal, defensive ZIP reader/writer for spreadsheet files. Only stored and deflate entries; every size is capped before and while inflating. */
import { ImportError } from "@/lib/import/errors";
export { ImportError };

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

export type ZipLimits = { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number; want: (name: string) => boolean };

/** Names of every entry (cheap: central directory only), plus the entries `want` accepts, inflated under hard caps. */
export function readZip(buf: Buffer, lim: ZipLimits): { names: string[]; files: Map<string, Buffer> } {
  if (buf.length < 22) throw new ImportError("This is not a valid spreadsheet file.");
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  if (eocd < 0) throw new ImportError("This is not a valid spreadsheet file.");
  const total = buf.readUInt16LE(eocd + 10), cenSize = buf.readUInt32LE(eocd + 12), cenOff = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cenOff === 0xffffffff || cenSize === 0xffffffff) throw new ImportError("Very large (ZIP64) workbooks are not supported.");
  if (total > lim.maxEntries) throw new ImportError("This workbook contains too many parts to be a normal spreadsheet.");
  if (cenOff + cenSize > buf.length) throw new ImportError("This is not a valid spreadsheet file.");
  const names: string[] = []; const files = new Map<string, Buffer>(); let budget = lim.maxTotalBytes; let p = cenOff;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CEN) throw new ImportError("This is not a valid spreadsheet file.");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    if (p + 46 + nl > buf.length) throw new ImportError("This is not a valid spreadsheet file.");
    const name = buf.toString("utf8", p + 46, p + 46 + nl);
    p += 46 + nl + el + cl;
    names.push(name);
    if (name.endsWith("/") || !lim.want(name)) continue;
    if (flags & 1) throw new ImportError("Password-protected workbooks cannot be imported. Remove the password and try again.");
    if (usize > lim.maxEntryBytes) throw new ImportError("A part of this workbook is too large to import safely.");
    budget -= usize; if (budget < 0) throw new ImportError("This workbook expands to more data than we accept.");
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== SIG_LOC) throw new ImportError("This is not a valid spreadsheet file.");
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    if (start + csize > buf.length) throw new ImportError("This is not a valid spreadsheet file.");
    const raw = buf.subarray(start, start + csize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) { try { data = inflateRawSync(raw, { maxOutputLength: Math.min(usize, lim.maxEntryBytes) + 1 }); } catch { throw new ImportError("This workbook is damaged or expands to more data than we accept."); } }
    else throw new ImportError("This workbook uses an unsupported compression method.");
    if (data.length !== usize) throw new ImportError("This workbook is damaged.");
    files.set(name, data);
  }
  return { names, files };
}

const crc = (b: Buffer): number => (typeof zcrc32 === "function" ? zcrc32(b) >>> 0 : slowCrc(b));
let TABLE: Uint32Array | null = null;
function slowCrc(b: Buffer): number {
  if (!TABLE) { TABLE = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[i] = c >>> 0; } }
  let c = 0xffffffff; for (const x of b) c = TABLE[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}

/** Store-only ZIP (templates are tiny). */
export function writeZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [], cens: Buffer[] = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8"), c = crc(e.data);
    const loc = Buffer.alloc(30); loc.writeUInt32LE(SIG_LOC, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(0, 8); loc.writeUInt32LE(0x58210000, 10); loc.writeUInt32LE(c, 14); loc.writeUInt32LE(e.data.length, 18); loc.writeUInt32LE(e.data.length, 22); loc.writeUInt16LE(name.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(SIG_CEN, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt32LE(0x58210000, 12); cen.writeUInt32LE(c, 16); cen.writeUInt32LE(e.data.length, 20); cen.writeUInt32LE(e.data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(off, 42);
    locals.push(loc, name, e.data); cens.push(cen, name); off += 30 + name.length + e.data.length;
  }
  const cenBuf = Buffer.concat(cens);
  const end = Buffer.alloc(22); end.writeUInt32LE(SIG_EOCD, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cenBuf, end]);
}
