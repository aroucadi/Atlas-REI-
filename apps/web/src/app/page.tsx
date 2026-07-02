"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        await api.me();
        router.push("/home");
      } catch {
        router.push("/login");
      }
    }
    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-muted font-mono text-xs">
      INITIALIZING TERMINAL SESSION...
    </div>
  );
}
