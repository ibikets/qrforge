import { adm } from "./db";

export type Loaded<T> = { ok: true; data: T } | { ok: false };
/** Wrap a read so a failure renders an error state, never an empty list. */
export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("admin read failed", (e as { message?: string })?.message);
    return { ok: false };
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function q(r: { data: any; error: { message: string } | null }): any {
  if (r.error) throw r.error;
  return r.data;
}
export { adm };

export const PAGE_SIZE = 25;
export const pageNum = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
};
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
