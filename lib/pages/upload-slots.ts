/**
 * Concurrency guard for the expensive part of an upload (decode, re-encode, rebuild). A request-rate limit alone does not bound CPU/memory:
 * a few large files at once can. Each user may run 2 at a time and one server instance 8; extra requests get a clear "try again" answer.
 * Per-instance by design (no shared store is paid for); the database quotas remain the hard limit on stored bytes and files.
 */
const PER_USER = 2, PER_INSTANCE = 8;
const active = new Map<string, number>(); let total = 0;
export async function withUploadSlot<T>(userId: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  const mine = active.get(userId) ?? 0;
  if (mine >= PER_USER || total >= PER_INSTANCE) return { ok: false };
  active.set(userId, mine + 1); total++;
  try { return { ok: true, value: await fn() }; }
  finally { total--; const n = (active.get(userId) ?? 1) - 1; if (n <= 0) active.delete(userId); else active.set(userId, n); }
}
export const slotLimits = { PER_USER, PER_INSTANCE };
