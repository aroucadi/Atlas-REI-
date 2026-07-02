import React from "react";

export default function LogoMark({
  className = "h-8 w-8",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M50 5L90 25V75L50 95L10 75V25L50 5Z"
        stroke="#27272a"
        strokeWidth="2"
      />
      <path
        d="M50 20L80 35V65L50 80L20 65V35L50 20Z"
        stroke="#10b981"
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />
      <circle cx="50" cy="50" r="10" stroke="#6366f1" strokeWidth="2" />
      <path
        d="M50 5V20M50 80V95M10 25L20 35M80 65L90 75M90 25L80 35M20 65L10 75"
        stroke="#27272a"
        strokeWidth="1.5"
      />
    </svg>
  );
}
