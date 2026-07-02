"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";

export default function DistrictDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  use(params);
  const router = useRouter();

  return (
    <div className="p-6 space-y-6 flex flex-col items-center justify-center min-h-[70vh]">
      <div className="max-w-md bg-bg-surface border border-border-default rounded-md p-8 text-center space-y-4">
        <div className="flex justify-center text-warning">
          <Compass className="h-12 w-12" />
        </div>
        <h1 className="text-xs font-bold tracking-tight text-text-primary uppercase font-mono">
          Module Offline / District Index Gated
        </h1>
        <p className="text-[11px] text-text-secondary leading-relaxed font-mono">
          The district details intelligence feed is offline. Geopolitical event
          mapping, supply risk profiles, and building grade matrices are
          deactivated in this release. Please use the core Underwrite and
          Committee workflows.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-2 px-3 py-1.5 bg-bg-base hover:bg-border-subtle border border-border-default rounded text-[10px] font-mono uppercase text-text-primary transition-colors cursor-pointer"
        >
          Return to Markets
        </button>
      </div>
    </div>
  );
}
