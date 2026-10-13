import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control border px-5 py-3 text-base font-medium no-underline transition-colors duration-150 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-muted aria-disabled:cursor-not-allowed";
const variants: Record<Variant, string> = {
  primary: "border-transparent bg-brand text-white hover:bg-brand-hover",
  secondary: "border-brand bg-transparent text-brand hover:bg-soft",
  ghost: "border-transparent bg-transparent text-brand hover:bg-soft",
  danger: "border-transparent bg-danger text-white hover:opacity-90",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}
