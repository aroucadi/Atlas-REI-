import React from "react";

export default function NoDocuments({
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
      <rect
        x="40"
        y="30"
        width="80"
        height="100"
        rx="6"
        stroke="#27272a"
        strokeWidth="1.5"
      />
      <path
        d="M55 50H105M55 70H105M55 90H85"
        stroke="#27272a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle
        cx="105"
        cy="105"
        r="20"
        fill="#18181b"
        stroke="#6366f1"
        strokeWidth="1.5"
      />
      <path
        d="M97 105H113M105 97V113"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
