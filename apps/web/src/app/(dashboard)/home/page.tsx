"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../../../context/TerminalContext";
import { api } from "../../../lib/api";
import { Compass, Clock, Layers, Globe, RefreshCw } from "lucide-react";
import NoPortfolio from "../../../components/visuals/NoPortfolio";

function BriefEvidenceCitation({
  evidenceId,
  evidenceList,
}: {
  evidenceId: string;
  evidenceList: any[];
}) {
  const [showPopover, setShowPopover] = useState(false);
  const matchedEvidence = evidenceList.find((e) => e.id === evidenceId);

  if (!matchedEvidence) {
    return (
      <span className="inline-block ml-1 px-1 py-0.5 bg-bg-base border border-border-default rounded-xs text-[8px] text-text-muted font-mono uppercase">
        Ref: {evidenceId.slice(0, 4)}
      </span>
    );
  }

  return (
    <span className="relative inline-block ml-1">
      <button
        onClick={() => setShowPopover(!showPopover)}
        type="button"
        className="px-1 py-0.5 bg-accent-intelligence/15 hover:bg-accent-intelligence/25 border border-accent-intelligence/30 rounded-xs text-[8px] font-bold text-accent-intelligence cursor-pointer uppercase font-mono"
      >
        {matchedEvidence.sourceType === "underwrite_assumption"
          ? "Assumption"
          : matchedEvidence.sourceType}{" "}
        🔗
      </button>
      {showPopover && (
        <span className="absolute left-0 mt-1 w-64 bg-bg-surface-elevated border border-border-default rounded-md shadow-lg p-3 z-50 text-text-primary text-[10px] leading-relaxed font-sans space-y-1.5 inline-block text-left whitespace-normal">
          <span className="block font-bold border-b border-border-subtle pb-1 uppercase tracking-wider text-text-muted">
            Evidence Details
          </span>
          <span className="block">
            <strong>Title:</strong> {matchedEvidence.title}
          </span>
          <span className="block">
            <strong>Source:</strong> {matchedEvidence.sourceType} (
            {matchedEvidence.sourceId.slice(0, 8)})
          </span>
          <span className="block">
            <strong>Freshness:</strong>{" "}
            {new Date(matchedEvidence.freshness).toLocaleDateString()}
          </span>
          {matchedEvidence.confidence !== null && (
            <span className="block">
              <strong>Confidence:</strong>{" "}
              {(Number(matchedEvidence.confidence) * 100).toFixed(0)}%
            </span>
          )}
          {matchedEvidence.snippet && (
            <span className="block italic text-text-secondary mt-1 p-1 bg-bg-base rounded-sm">
              "{matchedEvidence.snippet}"
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default function HomePage() {
  const { activeWorkspace, profiles, activeProfile, refreshProfiles } =
    useTerminal();

  const [events, setEvents] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    baseCurrency: "AED",
    capitalAvailable: 2000000,
    riskTolerance: "moderate",
    investmentHorizonMonths: 60,
    incomeVsGrowthPreference: "balanced",
    financingPreference: "mortgage",
  });

  const [error, setError] = useState("");

  const loadHomeData = async () => {
    if (!activeWorkspace) return;
    setError("");
    try {
      const evs = await api.getEvents();
      setEvents(evs);

      const ports = await api.getPortfolios(activeWorkspace.id);
      setPortfolios(ports);

      try {
        const br = await api.getDailyBrief(activeWorkspace.id);
        setBrief(br);
      } catch (err) {
        console.error("Failed to load daily brief", err);
      }

      try {
        const evList = await api.getEvidence(activeWorkspace.id);
        setEvidenceList(evList);
      } catch (err) {
        console.error("Failed to load evidence", err);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load dashboard data. Please try again.");
    }
  };

  const handleRegenerateBrief = async () => {
    if (!activeWorkspace) return;
    setGeneratingBrief(true);
    setError("");
    try {
      const br = await api.generateDailyBrief(activeWorkspace.id);
      setBrief(br);
      const evList = await api.getEvidence(activeWorkspace.id);
      setEvidenceList(evList);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate daily brief.");
    } finally {
      setGeneratingBrief(false);
    }
  };

  useEffect(() => {
    loadHomeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace]);

  useEffect(() => {
    if (activeProfile) {
      setProfileForm({
        name: activeProfile.name,
        baseCurrency: activeProfile.baseCurrency,
        capitalAvailable: Number(activeProfile.capitalAvailable),
        riskTolerance: activeProfile.riskTolerance,
        investmentHorizonMonths: activeProfile.investmentHorizonMonths,
        incomeVsGrowthPreference: activeProfile.incomeVsGrowthPreference,
        financingPreference: activeProfile.financingPreference,
      });
    }
  }, [activeProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile || !activeWorkspace) return;
    try {
      await api.updateProfile(activeWorkspace.id, activeProfile.id, {
        ...profileForm,
        targetCountries: activeProfile.targetCountriesJson || ["AE"],
      });
      setIsEditingProfile(false);
      await refreshProfiles();
    } catch (err) {
      console.error(err);
      setError("Failed to update profile. Please try again.");
    }
  };

  const convertCurrency = (
    amount: number,
    from: string,
    to: string,
  ): number => {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return amount;
    const rates: Record<string, Record<string, number>> = {
      USD: { AED: 3.6725, EUR: 0.92, USD: 1 },
      AED: { USD: 1 / 3.6725, EUR: 0.92 / 3.6725, AED: 1 },
      EUR: { USD: 1 / 0.92, AED: 3.6725 / 0.92, EUR: 1 },
    };
    const rate = rates[f]?.[t];
    return rate ? amount * rate : amount;
  };

  const activePortfolio = portfolios[0];
  const portfolioBaseCurrency = activePortfolio?.baseCurrency || "AED";

  const totalPortfolioValue =
    activePortfolio?.positions?.reduce((sum: number, pos: any) => {
      const converted = convertCurrency(
        Number(pos.acquisitionPrice),
        pos.acquisitionCurrency || "AED",
        portfolioBaseCurrency,
      );
      return sum + converted;
    }, 0) || 0;

  const activePosition = activePortfolio?.positions?.[0];
  const posCashFlow =
    activePosition?.cashFlowEntries?.reduce(
      (sum: number, entry: any) => sum + Number(entry.amount),
      0,
    ) || 0;
  const hasPosCashFlows =
    activePosition?.cashFlowEntries &&
    activePosition.cashFlowEntries.length > 0;
  const activePositionYield =
    hasPosCashFlows && Number(activePosition.acquisitionPrice) > 0
      ? (posCashFlow / Number(activePosition.acquisitionPrice)) * 100
      : null;

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-xs font-mono p-4 rounded-md">
          {error}
        </div>
      )}
      <div className="flex justify-between items-start border-b border-border-default pb-4">
        <div>
          <h1 className="text-lg font-bold text-text-primary tracking-tight">
            INVESTOR TERMINAL
          </h1>
          <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mt-1">
            Workspace: {activeWorkspace?.name || "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary font-mono">
          <Clock className="h-3.5 w-3.5 text-text-muted" />
          <span>
            Last data fetch:{" "}
            <span className="text-text-primary">
              {events.length > 0
                ? new Date(events[0].createdAt).toLocaleString()
                : "No data loaded"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <div className="flex justify-between items-center border-b border-border-subtle pb-2 mb-4">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                <Compass className="h-4 w-4 text-accent-intelligence" />
                <span>Workspace Intelligence Summary</span>
              </h2>
              {brief && (
                <button
                  onClick={handleRegenerateBrief}
                  disabled={generatingBrief}
                  type="button"
                  className="text-accent-intelligence hover:text-accent-intelligence/85 text-[10px] font-mono uppercase tracking-wider cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${generatingBrief ? "animate-spin" : ""}`}
                  />
                  <span>
                    {generatingBrief ? "Regenerating..." : "Regenerate"}
                  </span>
                </button>
              )}
            </div>
            <div className="space-y-4">
              {generatingBrief && !brief ? (
                <div className="p-4 bg-bg-base border border-border-subtle rounded-sm text-xs font-mono text-text-secondary animate-pulse text-center">
                  Synthesizing and grounding workspace daily brief summary...
                </div>
              ) : brief ? (
                <div className="space-y-4">
                  {brief.summaryJson?.inferredSummary && (
                    <div className="p-4 bg-bg-base border border-border-subtle rounded-sm text-xs leading-relaxed text-text-secondary">
                      <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5 font-bold">
                        Inferred Summary
                      </div>
                      <p className="font-sans italic">
                        {brief.summaryJson.inferredSummary}
                      </p>
                    </div>
                  )}

                  {brief.summaryJson?.bulletPoints &&
                    brief.summaryJson.bulletPoints.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider font-bold">
                          Sourced Highlights & Evidence
                        </div>
                        <div className="space-y-2">
                          {brief.summaryJson.bulletPoints.map(
                            (bp: any, idx: number) => (
                              <div
                                key={idx}
                                className="p-3 bg-bg-base/40 border border-border-subtle rounded-sm text-xs leading-relaxed text-text-secondary"
                              >
                                <div className="flex justify-between items-start gap-4">
                                  <div>
                                    <span className="font-bold text-text-primary font-sans">
                                      {bp.title}:
                                    </span>{" "}
                                    <span className="font-sans">
                                      {bp.description}
                                    </span>
                                  </div>
                                </div>
                                {bp.evidenceIds &&
                                  bp.evidenceIds.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                                      <span className="text-[9px] font-mono text-text-muted uppercase">
                                        Evidence:
                                      </span>
                                      {bp.evidenceIds.map((evId: string) => (
                                        <BriefEvidenceCitation
                                          key={evId}
                                          evidenceId={evId}
                                          evidenceList={evidenceList}
                                        />
                                      ))}
                                    </div>
                                  )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="p-4 bg-bg-base border border-border-subtle rounded-sm text-xs leading-relaxed text-text-secondary flex flex-col items-center gap-3">
                  <span className="text-center">
                    No workspace intelligence summary available. Daily briefs
                    will be generated when market events and portfolio positions
                    are linked.
                  </span>
                  <button
                    onClick={handleRegenerateBrief}
                    disabled={generatingBrief}
                    type="button"
                    className="px-3 py-1.5 bg-accent-intelligence text-text-inverse font-mono text-[10px] uppercase tracking-wider rounded-sm hover:bg-accent-intelligence/90 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${generatingBrief ? "animate-spin" : ""}`}
                    />
                    <span>
                      {generatingBrief
                        ? "Generating..."
                        : "Generate Daily Brief"}
                    </span>
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-mono">
                    Active Mandates
                  </div>
                  <div className="text-lg font-bold text-text-primary font-mono">
                    {profiles.length}
                  </div>
                </div>
                <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-mono">
                    Decisions
                  </div>
                  <div className="text-xs font-bold text-text-muted font-mono mt-1">
                    [Not Available]
                  </div>
                </div>
                <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-mono">
                    Portfolio Value
                  </div>
                  <div className="text-lg font-bold text-success font-mono">
                    {activePortfolio
                      ? `${totalPortfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${portfolioBaseCurrency}`
                      : "—"}
                  </div>
                </div>
                <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-mono">
                    Active Risks
                  </div>
                  <div className="text-lg font-bold text-warning font-mono">
                    {events.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4 flex items-center gap-2">
              <Globe className="h-4 w-4 text-success" />
              <span>War Room Alerts & Macro Signals</span>
            </h2>
            <div className="space-y-3">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 bg-bg-base border border-border-subtle rounded-sm flex justify-between items-start gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-mono border px-1.5 py-0.5 rounded uppercase ${
                          ev.severity === "high"
                            ? "bg-danger/10 text-danger border-danger/30"
                            : "bg-warning/10 text-warning border-warning/30"
                        }`}
                      >
                        {ev.severity} RISK
                      </span>
                      <span className="text-xs font-bold text-text-primary">
                        {ev.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      {ev.summary}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-text-muted font-mono">
                      Confidence
                    </div>
                    <div className="text-xs font-bold text-text-primary font-mono">
                      {(ev.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-6 text-text-muted text-xs font-mono">
                  No active alerts.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <div className="flex justify-between items-center border-b border-border-subtle pb-2 mb-4">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                <Layers className="h-4 w-4 text-accent-intelligence" />
                <span>Investor Mandate</span>
              </h2>
              {!isEditingProfile && activeProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="text-accent-intelligence hover:text-accent-intelligence/85 text-[10px] font-mono uppercase tracking-wider cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingProfile ? (
              <form onSubmit={handleUpdateProfile} className="space-y-3">
                <div>
                  <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                    Mandate Name
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.name}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, name: e.target.value })
                    }
                    className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                      Currency
                    </label>
                    <select
                      value={profileForm.baseCurrency}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          baseCurrency: e.target.value,
                        })
                      }
                      className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence"
                    >
                      <option
                        value="AED"
                        className="bg-bg-surface-elevated text-text-primary"
                      >
                        AED
                      </option>
                      <option
                        value="EUR"
                        className="bg-bg-surface-elevated text-text-primary"
                      >
                        EUR
                      </option>
                      <option
                        value="USD"
                        className="bg-bg-surface-elevated text-text-primary"
                      >
                        USD
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                      Capital
                    </label>
                    <input
                      type="number"
                      required
                      value={profileForm.capitalAvailable}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          capitalAvailable: Number(e.target.value),
                        })
                      }
                      className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                      Risk Mode
                    </label>
                    <select
                      value={profileForm.riskTolerance}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          riskTolerance: e.target.value,
                        })
                      }
                      className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence"
                    >
                      <option
                        value="conservative"
                        className="bg-bg-surface-elevated text-text-primary"
                      >
                        Conservative
                      </option>
                      <option
                        value="moderate"
                        className="bg-bg-surface-elevated text-text-primary"
                      >
                        Moderate
                      </option>
                      <option
                        value="aggressive"
                        className="bg-bg-surface-elevated text-text-primary"
                      >
                        Aggressive
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                      Horizon (M)
                    </label>
                    <input
                      type="number"
                      required
                      value={profileForm.investmentHorizonMonths}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          investmentHorizonMonths: Number(e.target.value),
                        })
                      }
                      className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="bg-bg-surface-elevated hover:bg-bg-surface-elevated/80 text-text-secondary px-2.5 py-1.5 rounded-sm text-[10px] uppercase font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-accent-intelligence hover:bg-accent-intelligence/90 text-text-inverse px-2.5 py-1.5 rounded-sm text-[10px] uppercase font-mono font-semibold"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : activeProfile ? (
              <div className="space-y-3">
                <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                  <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                    Mandate Name
                  </span>
                  <span className="text-xs font-bold text-text-primary">
                    {activeProfile.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      Capital
                    </span>
                    <span className="text-xs font-bold text-text-primary font-mono">
                      {Number(activeProfile.capitalAvailable).toLocaleString()}{" "}
                      {activeProfile.baseCurrency}
                    </span>
                  </div>
                  <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      Horizon
                    </span>
                    <span className="text-xs font-bold text-text-primary font-mono">
                      {activeProfile.investmentHorizonMonths} M
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      Risk Mode
                    </span>
                    <span className="text-xs font-bold text-text-primary uppercase">
                      {activeProfile.riskTolerance}
                    </span>
                  </div>
                  <div className="bg-bg-base p-3 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      Financing
                    </span>
                    <span className="text-xs font-bold text-text-primary uppercase">
                      {activeProfile.financingPreference}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-text-muted text-xs font-mono">
                No active mandate found.
              </div>
            )}
          </div>

          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4">
              Portfolio Snapshot
            </h2>
            {activePosition ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-secondary font-mono">
                    Property
                  </span>
                  <span className="text-text-primary font-semibold">
                    {activePosition.property?.building?.name ||
                      "Unnamed Property"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-secondary font-mono">
                    Acquisition Cost
                  </span>
                  <span className="text-text-primary font-bold font-mono">
                    {Number(activePosition.acquisitionPrice).toLocaleString()}{" "}
                    {activePosition.acquisitionCurrency}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-secondary font-mono">
                    Debt Leverage
                  </span>
                  <span className="text-text-primary font-bold font-mono">
                    {activePosition.financingFacilities?.[0]
                      ? `${activePosition.financingFacilities[0].interestRateValue}% Fixed`
                      : "No Leverage"}
                  </span>
                </div>
                <div className="p-3 bg-bg-base rounded-sm border border-border-subtle">
                  <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                    Target Yield Forecast
                  </div>
                  <div className="text-sm font-bold text-success font-mono">
                    {activePositionYield !== null
                      ? `${activePositionYield.toFixed(2)}% Net ARR`
                      : "N/A"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4">
                <NoPortfolio className="h-16 w-16 mb-2 text-text-muted" />
                <p className="text-[10px] text-text-muted font-mono">
                  No active holdings in workspace
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
