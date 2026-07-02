"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../../../context/TerminalContext";
import { api } from "../../../lib/api";
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Terminal,
  Shield,
  Clock,
  Coins,
  RefreshCw,
  Sliders,
  Check,
} from "lucide-react";

export default function AdminPage() {
  const { activeWorkspace, activeProfile, profiles, refreshProfiles } =
    useTerminal();

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Data
  const [analytics, setAnalytics] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  // Policy Settings Form State
  const [requireScreening, setRequireScreening] = useState(true);
  const [requireMemo, setRequireMemo] = useState(true);
  const [watchlistEnabled, setWatchlistEnabled] = useState(true);
  const [refinancingEnabled, setRefinancingEnabled] = useState(true);
  const [watchlistInterval, setWatchlistInterval] = useState(30);

  const fetchData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError("");
    try {
      // Fetch data in parallel
      const [analyticsData, agentsData, toolsData, jobsData] =
        await Promise.all([
          api.getAgentAnalytics(activeWorkspace.id),
          api.getAgentDefinitions(activeWorkspace.id),
          api.getToolDefinitions(activeWorkspace.id),
          api.getJobs(activeWorkspace.id),
        ]);

      setAnalytics(analyticsData);
      setAgents(agentsData);
      setTools(toolsData);
      setJobs(jobsData);

      if (jobsData.length > 0) {
        setSelectedJob(jobsData[0]);
      }

      // Pre-fill form from active profile constraints
      const profile =
        profiles.find((p: any) => p.id === activeProfile?.id) || profiles[0];
      if (profile) {
        const constraints = profile.constraints || {};
        setRequireScreening(constraints.requireScreeningApproval !== false);
        setRequireMemo(constraints.requireMemoApproval !== false);
        setWatchlistEnabled(constraints.watchlistCheckEnabled ?? true);
        setRefinancingEnabled(constraints.refinancingCheckEnabled ?? true);
        setWatchlistInterval(constraints.watchlistCheckIntervalSeconds || 30);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load operational admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, activeProfile, profiles]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    setSaving(true);
    setSuccessMsg("");
    setError("");
    try {
      await api.togglePolicy(activeWorkspace.id, {
        requireScreeningApproval: requireScreening,
        requireMemoApproval: requireMemo,
        watchlistCheckIntervalSeconds: Number(watchlistInterval),
        watchlistCheckEnabled: watchlistEnabled,
        refinancingCheckEnabled: refinancingEnabled,
      } as any);

      setSuccessMsg("Workspace governance policies successfully updated.");
      await refreshProfiles();

      // Fetch latest analytics
      const latestAnalytics = await api.getAgentAnalytics(activeWorkspace.id);
      setAnalytics(latestAnalytics);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update governance policy");
    } finally {
      setSaving(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6 text-center text-text-secondary font-mono text-xs">
        Please select a workspace to view agent operations.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 min-h-[50vh]">
        <RefreshCw className="h-6 w-6 animate-spin text-accent-intelligence" />
        <span className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
          Querying Agent Runtime Registry & Metrics...
        </span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-sm font-bold tracking-tight text-text-primary uppercase font-mono flex items-center gap-2">
            <Cpu className="h-4 w-4 text-accent-intelligence animate-pulse" />
            Agent Operations Control Center
          </h1>
          <p className="text-[11px] text-text-secondary font-mono mt-0.5">
            Monitor active agent metrics, manage workspace-specific policies,
            inspect logs, and configure registries.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-surface hover:bg-bg-surface-elevated border border-border-subtle hover:border-border-default rounded-sm text-[10px] text-text-primary font-mono transition-all cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
          FORCE SYNC
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Analytics + Policy Editor */}
        <div className="xl:col-span-2 space-y-6">
          {/* Analytics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-2">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-[9px] font-mono uppercase tracking-wider">
                  Total runs
                </span>
                <Activity className="h-3.5 w-3.5 text-accent-intelligence" />
              </div>
              <p className="text-xl font-semibold font-mono tracking-tight text-text-primary">
                {analytics?.totalRuns || 0}
              </p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-2">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-[9px] font-mono uppercase tracking-wider">
                  Success Rate
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 text-accent-success" />
              </div>
              <p className="text-xl font-semibold font-mono tracking-tight text-text-primary">
                {analytics
                  ? `${(analytics.completionRate * 100).toFixed(0)}%`
                  : "0%"}
              </p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-2">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-[9px] font-mono uppercase tracking-wider">
                  Avg Latency
                </span>
                <Clock className="h-3.5 w-3.5 text-accent-attention" />
              </div>
              <p className="text-xl font-semibold font-mono tracking-tight text-text-primary">
                {analytics
                  ? `${(analytics.averageLatencyMs / 1000).toFixed(2)}s`
                  : "0s"}
              </p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-2">
              <div className="flex items-center justify-between text-text-muted">
                <span className="text-[9px] font-mono uppercase tracking-wider">
                  Cumulative Cost
                </span>
                <Coins className="h-3.5 w-3.5 text-accent-intelligence" />
              </div>
              <p className="text-xl font-semibold font-mono tracking-tight text-text-primary">
                AED {analytics?.cumulativeCost?.toFixed(4) || "0.0000"}
              </p>
            </div>
          </div>

          {/* AI Agent Token Telemetry Panel */}
          <div className="bg-bg-surface border border-border-subtle rounded-sm p-5 space-y-4">
            <h2 className="text-xs font-bold tracking-tight text-text-primary uppercase font-mono border-b border-border-subtle pb-2 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-accent-intelligence animate-pulse" />
              AI Agent Token Telemetry & Model Distribution
            </h2>
            <div className="text-center py-6 text-text-muted text-xs font-mono">
              [Telemetry Data Not Yet Available]
            </div>
          </div>

          {/* Governance Policies */}
          <div className="bg-bg-surface border border-border-subtle rounded-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <h2 className="text-xs font-bold tracking-tight text-text-primary uppercase font-mono flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-accent-intelligence" />
                Workspace Governance Policies
              </h2>
              <Sliders className="h-3.5 w-3.5 text-text-muted" />
            </div>

            <form onSubmit={handleSavePolicy} className="space-y-4">
              {successMsg && (
                <div className="p-3 bg-accent-success/10 border border-accent-success/20 text-accent-success text-[10px] font-mono rounded-sm flex items-center gap-2">
                  <Check className="h-3.5 w-3.5" />
                  {successMsg}
                </div>
              )}
              {error && (
                <div className="p-3 bg-accent-error/10 border border-accent-error/20 text-accent-error text-[10px] font-mono rounded-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gate A Policy Toggle */}
                <div className="border border-border-subtle p-3.5 rounded-sm bg-bg-base/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono font-bold text-text-primary uppercase tracking-wide">
                      Gate A: Screening human checkpoint
                    </label>
                    <input
                      type="checkbox"
                      checked={requireScreening}
                      onChange={(e) => setRequireScreening(e.target.checked)}
                      className="accent-accent-intelligence h-3.5 w-3.5 cursor-pointer"
                    />
                  </div>
                  <p className="text-[9px] text-text-secondary leading-relaxed font-sans">
                    When enabled, the Multi-Agent Workflow will halt after
                    screening evaluation, requiring human confirmation before
                    executing Lease Diligence checks.
                  </p>
                </div>

                {/* Gate B Policy Toggle */}
                <div className="border border-border-subtle p-3.5 rounded-sm bg-bg-base/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono font-bold text-text-primary uppercase tracking-wide">
                      Gate B: Final memo checkpoint
                    </label>
                    <input
                      type="checkbox"
                      checked={requireMemo}
                      onChange={(e) => setRequireMemo(e.target.checked)}
                      className="accent-accent-intelligence h-3.5 w-3.5 cursor-pointer"
                    />
                  </div>
                  <p className="text-[9px] text-text-secondary leading-relaxed font-sans">
                    When enabled, compiled memos from both single and
                    multi-agent workflows require manual review and approval
                    before being published as workspace documents.
                  </p>
                </div>

                {/* Background Watchlist Monitoring Toggle */}
                <div className="border border-border-subtle p-3.5 rounded-sm bg-bg-base/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono font-bold text-text-primary uppercase tracking-wide">
                      Cron: Watchlist Diligence gaps
                    </label>
                    <input
                      type="checkbox"
                      checked={watchlistEnabled}
                      onChange={(e) => setWatchlistEnabled(e.target.checked)}
                      className="accent-accent-intelligence h-3.5 w-3.5 cursor-pointer"
                    />
                  </div>
                  <p className="text-[9px] text-text-secondary leading-relaxed font-sans">
                    Runs periodic checks on all properties in the workspace to
                    verify lease agreements and alert users to documentation
                    diligence gaps.
                  </p>
                </div>

                {/* Background Refinancing Monitoring Toggle */}
                <div className="border border-border-subtle p-3.5 rounded-sm bg-bg-base/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono font-bold text-text-primary uppercase tracking-wide">
                      Cron: Refinancing Alert checks
                    </label>
                    <input
                      type="checkbox"
                      checked={refinancingEnabled}
                      onChange={(e) => setRefinancingEnabled(e.target.checked)}
                      className="accent-accent-intelligence h-3.5 w-3.5 cursor-pointer"
                    />
                  </div>
                  <p className="text-[9px] text-text-secondary leading-relaxed font-sans">
                    Compares current property mortgage interest rates with
                    updated macroeconomic rate baselines to notify users of rate
                    optimization opportunities.
                  </p>
                </div>
              </div>

              {/* Watchlist check interval input */}
              <div className="flex items-center gap-4 bg-bg-base/10 p-3 rounded-sm border border-border-subtle">
                <div className="flex-1 space-y-0.5">
                  <span className="text-[10px] font-mono font-bold text-text-primary uppercase tracking-wide block">
                    Watchlist cron Interval (seconds)
                  </span>
                  <span className="text-[9px] text-text-secondary font-sans leading-none block">
                    Frequency for executing background monitoring and alert
                    ingestion.
                  </span>
                </div>
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={watchlistInterval}
                  onChange={(e) => setWatchlistInterval(Number(e.target.value))}
                  className="bg-bg-base border border-border-subtle rounded-sm text-xs text-text-primary font-mono p-1.5 w-24 focus:outline-none focus:border-accent-intelligence"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-accent-intelligence hover:bg-accent-intelligence-hover disabled:opacity-50 text-white font-mono text-[10px] font-bold rounded-sm tracking-wide transition-all uppercase cursor-pointer"
                >
                  {saving ? "SAVING CHANGES..." : "SAVE POLICY CONFIGURATION"}
                </button>
              </div>
            </form>
          </div>

          {/* Registries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Agent Registry */}
            <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-3">
              <h3 className="text-xs font-bold text-text-primary uppercase font-mono border-b border-border-subtle pb-1.5">
                Agent Registry ({agents.length})
              </h3>
              <div className="divide-y divide-border-subtle max-h-60 overflow-y-auto pr-1">
                {agents.map((agent: any) => (
                  <div key={agent.id} className="py-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold font-mono text-text-primary">
                        {agent.name}
                      </span>
                      <span className="text-[8px] font-mono bg-bg-base text-text-secondary px-1.5 py-0.5 rounded-xs border border-border-subtle">
                        v{agent.version}
                      </span>
                    </div>
                    <p className="text-[9px] text-text-secondary leading-relaxed font-sans">
                      {agent.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {agent.requiredTools.map((t: string) => (
                        <span
                          key={t}
                          className="text-[7.5px] font-mono bg-accent-intelligence/5 border border-accent-intelligence/15 text-accent-intelligence px-1 rounded-2xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tool Registry */}
            <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-3">
              <h3 className="text-xs font-bold text-text-primary uppercase font-mono border-b border-border-subtle pb-1.5">
                Tool Registry ({tools.length})
              </h3>
              <div className="divide-y divide-border-subtle max-h-60 overflow-y-auto pr-1">
                {tools.map((tool: any) => (
                  <div key={tool.name} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold font-mono text-accent-intelligence">
                        {tool.name}
                      </span>
                      <span className="text-[8px] font-mono bg-bg-base text-text-muted px-1.5 py-0.5 rounded-xs">
                        v{tool.version}
                      </span>
                    </div>
                    <p className="text-[9px] text-text-secondary leading-relaxed font-sans">
                      {tool.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Platform Logs + Failure Hotspots */}
        <div className="space-y-6">
          {/* Failure Hotspots */}
          {analytics?.failureHotspots?.length > 0 && (
            <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-3">
              <h3 className="text-xs font-bold text-accent-error uppercase font-mono flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Failure Hotspots
              </h3>
              <div className="space-y-2">
                {analytics.failureHotspots.map((hotspot: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-accent-error/5 border border-accent-error/15 rounded-sm p-2.5 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold font-mono uppercase text-accent-error">
                        Step: {hotspot.step}
                      </span>
                      <span className="text-[8px] font-mono bg-accent-error/15 text-accent-error px-1.5 py-0.5 rounded-2xs">
                        {hotspot.count} failures
                      </span>
                    </div>
                    <p className="text-[9px] text-text-secondary font-mono leading-tight break-all">
                      {hotspot.errorMessage}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Run Tracker / Logs */}
          <div className="bg-bg-surface border border-border-subtle rounded-sm p-4 space-y-3">
            <h3 className="text-xs font-bold text-text-primary uppercase font-mono border-b border-border-subtle pb-1.5 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-accent-intelligence" />
              Platform Run Logs
            </h3>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {jobs.length === 0 ? (
                <div className="text-center py-6 text-[10px] font-mono text-text-secondary uppercase">
                  No execution runs recorded.
                </div>
              ) : (
                jobs.map((job: any) => {
                  const isSelected = selectedJob?.id === job.id;
                  const statusColors: any = {
                    completed:
                      "border-accent-success/20 text-accent-success bg-accent-success/5",
                    failed:
                      "border-accent-error/20 text-accent-error bg-accent-error/5",
                    running:
                      "border-accent-intelligence/20 text-accent-intelligence bg-accent-intelligence/5 animate-pulse",
                    awaiting_approval:
                      "border-accent-attention/20 text-accent-attention bg-accent-attention/5",
                    blocked:
                      "border-accent-error/20 text-accent-error bg-accent-error/5",
                  };
                  return (
                    <button
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`text-left w-full p-2.5 rounded-sm border transition-all cursor-pointer ${
                        isSelected
                          ? "border-accent-intelligence bg-accent-intelligence/10"
                          : "border-border-subtle hover:border-border-default bg-bg-base/30"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-mono font-bold text-text-primary uppercase tracking-wide">
                          {job.jobType?.replace(/_/g, " ")}
                        </span>
                        <span
                          className={`text-[7px] font-mono font-bold uppercase border px-1 py-0.5 rounded-2xs ${statusColors[job.status] || "border-border-default text-text-muted"}`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[8px] text-text-muted font-mono">
                        <span>ID: {job.id.slice(0, 8)}...</span>
                        <span>
                          {new Date(job.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Run Trace Detail */}
            {selectedJob && (
              <div className="border border-border-subtle rounded-sm bg-bg-base p-3 space-y-2 mt-4">
                <div className="flex items-center justify-between border-b border-border-subtle pb-1">
                  <span className="text-[9px] font-mono font-bold text-text-primary uppercase">
                    Run step trace
                  </span>
                  <span className="text-[8px] font-mono text-text-muted">
                    Progress: {selectedJob.progressPct}%
                  </span>
                </div>

                <div className="bg-black/90 p-2.5 rounded-sm text-[8.5px] font-mono text-white max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
                  {selectedJob.resultRefJson?.stepTrace &&
                  selectedJob.resultRefJson.stepTrace.length > 0 ? (
                    selectedJob.resultRefJson.stepTrace.map(
                      (step: string, idx: number) => (
                        <div key={idx} className="flex gap-1">
                          <span className="text-accent-intelligence font-bold">
                            [{idx + 1}]
                          </span>
                          <span className="text-text-secondary leading-normal">
                            {step}
                          </span>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="text-text-muted">
                      No step trace recorded for this run.
                    </div>
                  )}

                  {selectedJob.errorMessage && (
                    <div className="text-accent-error mt-2 border-t border-accent-error/25 pt-1.5">
                      ERROR: {selectedJob.errorMessage}
                    </div>
                  )}
                </div>

                {selectedJob.resultRefJson?.runLogs &&
                  selectedJob.resultRefJson.runLogs.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[8px] font-mono font-bold text-text-muted uppercase block">
                        Internal logs
                      </span>
                      <div className="bg-black/90 p-2 rounded-sm text-[8px] font-mono text-accent-success max-h-32 overflow-y-auto leading-normal space-y-1">
                        {selectedJob.resultRefJson.runLogs.map(
                          (log: any, idx: number) => (
                            <div key={idx} className="flex gap-2">
                              <span className="text-text-muted">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                              <span>{log.message}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
