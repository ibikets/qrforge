import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const controlClass =
  "min-h-12 w-full rounded-control border border-control-border bg-transparent p-3 text-base text-ink placeholder:text-muted disabled:bg-disabled disabled:text-muted aria-[invalid=true]:border-danger";

type Common = { label: string; id: string; help?: ReactNode; error?: string | null };

function Wrap({ id, label, help, error, children }: Common & { children: ReactNode }) {
  return (
    <div className="mb-6">
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      {children}
      {help && !error ? (
        <p id={`${id}-help`} className="mt-2 text-[13px] text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
const describe = (id: string, help?: ReactNode, error?: string | null) =>
  error ? `${id}-err` : help ? `${id}-help` : undefined;

export function TextField({ label, id, help, error, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrap {...{ label, id, help, error }}>
      <input
        id={id}
        className={controlClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, help, error)}
        {...rest}
      />
    </Wrap>
  );
}
export function TextArea({ label, id, help, error, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrap {...{ label, id, help, error }}>
      <textarea
        id={id}
        className={`${controlClass} min-h-28 resize-y`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, help, error)}
        {...rest}
      />
    </Wrap>
  );
}
export function SelectField({ label, id, help, error, children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrap {...{ label, id, help, error }}>
      <select
        id={id}
        className={`${controlClass} bg-surface`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(id, help, error)}
        {...rest}
      >
        {children}
      </select>
    </Wrap>
  );
}
