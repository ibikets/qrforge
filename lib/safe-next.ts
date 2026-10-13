/** Same-origin relative paths only; rejects protocol-relative (//), backslashes and control characters. */
export function safeNext(value: string | null | undefined, fallback = "/create"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
