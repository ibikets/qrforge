/** vCard file helpers shared by the hosted card download and the static contact file. */

/** RFC 2425/2426 line folding: lines longer than 75 octets continue on the next line after a single space. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "", len = 0;
  for (const ch of Array.from(line)) {
    const n = enc.encode(ch).length;
    if (len + n > 75) { out.push(cur); cur = " "; len = 1; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

/** Maximum base64 characters of an embedded contact photo (about 6.5 KB of JPEG). Keeps saved records and files small. */
export const MAX_PHOTO_B64 = 9000;
export const isPhotoB64 = (s: string) => s.length > 0 && s.length <= MAX_PHOTO_B64 && /^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(s);

/**
 * The static code's payload (photo-free, LF) as a downloadable .vcf: CRLF endings, folded lines, and the optional PHOTO.
 * The QR code itself never contains the photo; only this file does.
 */
export function vcfWithPhoto(payload: string, photoB64: string | null): string {
  const lines = payload.split("\n").filter(Boolean);
  if (photoB64 && isPhotoB64(photoB64)) {
    const end = lines.lastIndexOf("END:VCARD");
    lines.splice(end < 0 ? lines.length : end, 0, `PHOTO;ENCODING=b;TYPE=JPEG:${photoB64}`);
  }
  return lines.map(fold).join("\r\n") + "\r\n";
}
