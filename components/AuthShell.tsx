import type { ReactNode } from "react";

export default function AuthShell({ title, children, lead }: { title: string; children: ReactNode; lead?: string }) {
  return (
    <div className="mx-auto my-8 max-w-[440px] px-5 sm:my-16">
      <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-[-0.6px] sm:text-[32px]">{title}</h1>
      {lead ? <p className="mb-6 text-muted">{lead}</p> : null}
      {children}
    </div>
  );
}
