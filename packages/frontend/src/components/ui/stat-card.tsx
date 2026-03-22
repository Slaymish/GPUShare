import { type ReactNode } from "react";

interface StatCardProps {
  icon?: ReactNode;
  label: string;
  value: string;
  subLabel?: string;
  className?: string;
}

export function StatCard({
  icon,
  label,
  value,
  subLabel,
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`bg-white rounded-xl p-4 border border-[#E5E1DB] ${className}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-[#6F6B66]">{icon}</span>}
        <span className="text-xs text-[#6F6B66]">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subLabel && (
        <div className="text-xs text-[#B1ADA1] mt-1">{subLabel}</div>
      )}
    </div>
  );
}
