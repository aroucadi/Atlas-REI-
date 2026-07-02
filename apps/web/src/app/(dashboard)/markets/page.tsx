"use client";

import React from "react";
import { Compass } from "lucide-react";

export default function MarketsPage() {
  return (
    <div className="p-6 space-y-6 flex flex-col items-center justify-center min-h-[70vh]">
      <div className="max-w-md bg-bg-surface border border-border-default rounded-md p-8 text-center space-y-4">
        <div className="flex justify-center text-warning">
          <Compass className="h-12 w-12" />
        </div>
        <h1 className="text-xs font-bold tracking-tight text-text-primary uppercase font-mono">
          [Coming Soon] Module Offline / Markets Explorer Gated
        </h1>
        <p className="text-[11px] text-text-secondary leading-relaxed font-mono">
          The comparative Markets Explorer indexing engine is offline. Real-time
          district indices, yield trends, and appreciation scores are
          deactivated in this release. Please use the core Underwrite and
          Committee workflows.
        </p>
      </div>
    </div>
  );
}
