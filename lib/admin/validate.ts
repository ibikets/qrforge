import { fail } from "./guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Body = Record<string, unknown>;

export function uuid(b: Body, k: string): string {
  const v = b[k];
  if (typeof v !== "string" || !UUID.test(v)) throw fail(422, "Invalid identifier.", k);
  return v.toLowerCase();
}
export function str(b: Body, k: string, o: { min?: number; max: number; optional?: boolean; label?: string }): string {
  const v = b[k];
  if (v === undefined || v === null || v === "") {
    if (o.optional) return "";
    throw fail(422, `${o.label ?? k} is required.`, k);
  }
  if (typeof v !== "string") throw fail(422, `${o.label ?? k} must be text.`, k);
  const t = v.trim();
  if (t.length < (o.min ?? 1)) throw fail(422, `${o.label ?? k} is too short.`, k);
  if (t.length > o.max) throw fail(422, `${o.label ?? k} must be ${o.max} characters or fewer.`, k);
  // control characters are never legitimate in these fields
   
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t)) throw fail(422, `${o.label ?? k} contains characters that are not allowed.`, k);
  return t;
}
export function int(b: Body, k: string, o: { min: number; max: number; optional?: boolean; label?: string }): number | null {
  const v = b[k];
  if (v === undefined || v === null || v === "") {
    if (o.optional) return null;
    throw fail(422, `${o.label ?? k} is required.`, k);
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < o.min || n > o.max) throw fail(422, `${o.label ?? k} must be a whole number from ${o.min} to ${o.max}.`, k);
  return n;
}
export function oneOf<T extends string>(b: Body, k: string, allowed: readonly T[], label?: string): T {
  const v = b[k];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw fail(422, `${label ?? k} is not one of the allowed values.`, k);
  return v as T;
}
export function email(b: Body, k: string, optional = false): string {
  const v = str(b, k, { max: 254, optional, label: "Email" }).toLowerCase();
  if (!v) return v;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw fail(422, "Enter a valid email address.", k);
  return v;
}
export function httpsUrl(v: string, field: string): string {
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password) throw new Error();
    return u.toString();
  } catch {
    throw fail(422, "Enter a full https:// address.", field);
  }
}
export function date(b: Body, k: string): string {
  const v = str(b, k, { max: 40, label: "Date" });
  // A date typed without a zone is Lagos time (UTC+1, no daylight saving).
  const d = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) ? `${v}+01:00` : v);
  if (Number.isNaN(d.getTime())) throw fail(422, "Enter a valid date and time.", k);
  return d.toISOString();
}
export function stringList(b: Body, k: string, allowed: readonly string[]): string[] {
  const v = b[k];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !allowed.includes(x))) throw fail(422, "Contains a value that is not allowed.", k);
  return [...new Set(v as string[])];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function must(r: { data: any; error: { message: string; code?: string } | null }): any {
  if (r.error) throw r.error;
  return r.data;
}
