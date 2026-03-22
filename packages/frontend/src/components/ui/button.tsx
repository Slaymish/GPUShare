import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "success" | "error" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    const baseStyles =
      "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#F4F3EE] disabled:opacity-50 disabled:pointer-events-none";

    const variantStyles = {
      primary: "text-white hover:opacity-90 focus:ring-[#C15F3C]",
      secondary: "bg-[#EDEAE3] text-[#2D2B28] hover:bg-[#E5E1DB] focus:ring-[#C15F3C]",
      success: "text-white hover:opacity-90 focus:ring-[#2E7D32]",
      error: "text-white hover:opacity-90 focus:ring-[#C62828]",
      ghost: "text-[#6F6B66] hover:text-[#2D2B28] hover:bg-[#EDEAE3]",
    };

    const variantInlineStyles: Record<string, React.CSSProperties> = {
      primary: { backgroundColor: "var(--color-primary)" },
      secondary: {},
      success: { backgroundColor: "var(--color-success)" },
      error: { backgroundColor: "var(--color-error)" },
      ghost: {},
    };

    const sizeStyles = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
    };

    return (
      <Comp
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        style={{ ...variantInlineStyles[variant], ...props.style }}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
