import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "default" | "dark" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-yellow text-ink",
  default: "bg-card text-ink",
  dark: "bg-term text-term-green",
  danger: "bg-red text-paper",
  ghost: "bg-transparent text-ink shadow-none hover:bg-sunk",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
  lg: "min-h-13 px-6 text-lg",
};

export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "md", extra = "") {
  const shadow = variant === "ghost" ? "" : "shadow-hard-sm press";
  return `inline-flex items-center justify-center gap-2 border-2 border-ink font-bold ${VARIANT[variant]} ${SIZE[size]} ${shadow} disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none disabled:shadow-none ${extra}`;
}

export function Button({
  variant = "default",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; children: ReactNode }) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "default",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
