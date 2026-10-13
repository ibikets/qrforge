import type { ReactNode } from "react";

/** tone "error"/"warning" use role=alert/status semantics; info is plain text. */
export function Notice({
  title,
  children,
  tone = "info",
  live,
}: {
  title?: string;
  children?: ReactNode;
  tone?: "info" | "warning" | "error";
  live?: boolean;
}) {
  const bg = tone === "warning" ? "bg-warning-bg" : "bg-soft";
  const color = tone === "error" ? "text-danger" : tone === "warning" ? "text-warning" : "text-brand";
  const role = live ? (tone === "error" ? "alert" : "status") : undefined;
  return (
    <div className={`my-6 rounded-control p-4 ${bg}`} role={role}>
      {title ? <strong className={`mb-1 block font-medium ${color}`}>{title}</strong> : null}
      {children ? <div className="text-sm text-muted">{children}</div> : null}
    </div>
  );
}
