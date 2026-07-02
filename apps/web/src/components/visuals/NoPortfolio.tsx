import React from "react";

export default function NoPortfolio({
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
      <path d="M30 130H130M30 30V130" stroke="#27272a" strokeWidth="1.5" />
      <path
        d="M30 110H130M30 90H130M30 70H130M30 50H130"
        stroke="#27272a"
        strokeWidth="0.5"
        strokeDasharray="2 4"
      />
      <rect x="45" y="100" width="12" height="30" rx="2" fill="#27272a" />
      <rect x="65" y="80" width="12" height="50" rx="2" fill="#27272a" />
      <rect x="85" y="60" width="12" height="70" rx="2" fill="#27272a" />
      <rect x="105" y="40" width="12" height="90" rx="2" fill="#27272a" />
      <path
        d="M45 100L65 80L85 60L105 40"
        stroke="#ef4444"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
      <circle cx="105" cy="40" r="4" fill="#ef4444" />
    </svg>
  );
}
