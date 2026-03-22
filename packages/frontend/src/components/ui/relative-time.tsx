import { useState, useEffect } from "react";

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffSec = Math.round((now - date.getTime()) / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < MINUTE) return `${diffSec}s ago`;
  if (diffSec < HOUR) return `${Math.floor(diffSec / MINUTE)}m ago`;
  if (diffSec < DAY) return `${Math.floor(diffSec / HOUR)}h ago`;

  const diffDays = Math.floor(diffSec / DAY);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface RelativeTimeProps {
  date: string | Date;
  className?: string;
}

export function RelativeTime({ date, className = "" }: RelativeTimeProps) {
  const d = typeof date === "string" ? new Date(date) : date;
  const [text, setText] = useState(() => formatRelativeTime(d));

  useEffect(() => {
    setText(formatRelativeTime(d));
    const interval = setInterval(() => {
      setText(formatRelativeTime(d));
    }, 60_000);
    return () => clearInterval(interval);
  }, [date]);

  return (
    <time
      dateTime={d.toISOString()}
      title={d.toLocaleString()}
      className={className}
    >
      {text}
    </time>
  );
}
