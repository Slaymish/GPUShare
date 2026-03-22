import { type HTMLAttributes } from "react";

const variants: Record<string, string> = {
  green: "bg-[#E8F5E9] text-[#2E7D32]",
  purple: "bg-[#EDE7F6] text-[#5E35B1]",
  grey: "bg-[#EDEAE3] text-[#6F6B66]",
  amber: "bg-[#FFF3E0] text-[#E65100]",
  red: "bg-[#FFEBEE] text-[#C62828]",
  blue: "bg-[#E3F2FD] text-[#1565C0]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

export function Badge({
  variant = "grey",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium leading-tight ${variants[variant] || variants.grey} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
