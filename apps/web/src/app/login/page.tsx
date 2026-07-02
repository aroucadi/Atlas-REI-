"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import LogoMark from "../../components/visuals/LogoMark";

export default function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegistering) {
        await api.register(email, fullName, password);
      }
      await api.login(email, password);
      router.push("/home");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col justify-center items-center px-4 font-sans text-text-secondary">
      <div className="w-full max-w-md bg-bg-surface border border-border-default rounded-md p-8 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <LogoMark className="h-10 w-10" />
            <span className="text-2xl font-bold tracking-tight text-text-primary">
              ATLAS <span className="text-accent-intelligence">REI</span>
            </span>
          </div>
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-mono">
            INVESTMENT OS / SYSTEM ACCESS
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <div>
              <label
                htmlFor="fullName"
                className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold"
              >
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Alexander Delano"
                className="w-full bg-bg-base border border-border-default rounded-sm py-2 px-3 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence focus-visible:ring-1 focus-visible:ring-accent-intelligence transition-colors"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. investor@atlasrei.com"
              className="w-full bg-bg-base border border-border-default rounded-sm py-2 px-3 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence focus-visible:ring-1 focus-visible:ring-accent-intelligence transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-bg-base border border-border-default rounded-sm py-2 px-3 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence focus-visible:ring-1 focus-visible:ring-accent-intelligence transition-colors"
            />
          </div>

          {error && (
            <div className="bg-danger-soft border border-danger rounded-md p-3 flex gap-2 items-start text-xs text-danger font-mono">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-intelligence hover:bg-accent-intelligence/90 active:bg-accent-intelligence disabled:bg-bg-surface-elevated disabled:text-text-muted text-text-inverse font-medium py-2.5 px-4 rounded-sm transition-colors flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider font-semibold focus-visible:ring-2 focus-visible:ring-accent-intelligence focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base outline-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-text-inverse" />
            ) : isRegistering ? (
              "Initialize System Account"
            ) : (
              "Authenticate Session"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setError("");
              setIsRegistering(!isRegistering);
            }}
            className="text-text-secondary hover:text-accent-intelligence transition-colors text-xs underline font-medium focus-visible:ring-1 focus-visible:ring-accent-intelligence outline-none rounded-xs"
          >
            {isRegistering
              ? "Existing mandate? Sign In"
              : "Configure new mandate? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
