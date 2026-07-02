import React from "react";

export default function NoDeals({
  className = "h-32 w-32",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="160" height="160" rx="8" fill="#18181b" />
      <path d="M20 20H140V140H20V20Z" stroke="#27272a" strokeWidth="1" />
      <path
        d="M20 44H140M20 68H140M20 92H140M20 116H140M44 20V140M68 20V140M92 20V140M116 20V140"
        stroke="#27272a"
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
      <circle
        cx="80"
        cy="80"
        r="40"
        stroke="#6366f1"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <circle cx="80" cy="80" r="20" stroke="#10b981" strokeWidth="1" />
      <path d="M80 80L110 50" stroke="#10b981" strokeWidth="1.5" />
      <path d="M105 45H115V55" stroke="#10b981" strokeWidth="1.5" />
    </svg>
  );
}
