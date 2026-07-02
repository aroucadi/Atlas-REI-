"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../../../context/TerminalContext";
import { api } from "../../../lib/api";
import {
  Layers,
  Search,
  Plus,
  Loader2,
  Bookmark,
  ChevronRight,
  TrendingUp,
  Shield,
  Trash2,
  AlertCircle,
} from "lucide-react";

export default function DealsPage() {
  const { activeWorkspace, activeProfile, profiles, refreshProfiles } =
    useTerminal();

  // State
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<any[]>([]);
  const [shortlists, setShortlists] = useState<any[]>([]);
  const [error, setError] = useState("");

  // Form states for creating a profile
  const [profileName, setProfileName] = useState("Primary Mandate");
  const [baseCurrency, setBaseCurrency] = useState("AED");
  const [capitalAvailable, setCapitalAvailable] = useState(1500000);
  const [riskTolerance, setRiskTolerance] = useState("moderate");
  const [investmentHorizonMonths, setInvestmentHorizonMonths] = useState(60);
  const [incomeVsGrowthPreference, setIncomeVsGrowthPreference] =
    useState("balanced");
  const [financingPreference, setFinancingPreference] = useState("flexible");
  const [targetCountries, setTargetCountries] = useState<string[]>(["AE"]);

  // Shortlist creation states
  const [isCreatingShortlist, setIsCreatingShortlist] = useState(false);
  const [newShortlistName, setNewShortlistName] = useState("");
  const [openMenuPropertyId, setOpenMenuPropertyId] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3000);
  };

  // Fetch deals and shortlists
  const fetchData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError("");
    try {
      // Fetch shortlists
      const slList = await api.getShortlists(activeWorkspace.id);
      setShortlists(slList);

      // Fetch deals (if profile exists)
      if (profiles.length > 0) {
        const dealList = await api.searchDeals(
          activeWorkspace.id,
          activeProfile?.id,
        );
        setDeals(dealList);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch investment matching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, activeProfile, profiles]);

  // Close shortlist dropdown menu on click outside
  useEffect(() => {
    if (!openMenuPropertyId) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".shortlist-dropdown-container")) {
        setOpenMenuPropertyId(null);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [openMenuPropertyId]);

  // Handle Profile Creation
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    setLoading(true);
    setError("");
    try {
      const payload = {
        name: profileName,
        baseCurrency,
        capitalAvailable: Number(capitalAvailable),
        riskTolerance,
        investmentHorizonMonths: Number(investmentHorizonMonths),
        incomeVsGrowthPreference,
        financingPreference,
        targetCountries,
        constraints: {},
        goals: {},
      };
      await api.createProfile(activeWorkspace.id, payload);
      await refreshProfiles();
    } catch (err: any) {
      setError(err.message || "Failed to initialize profile");
      setLoading(false);
    }
  };

  // Handle Shortlist Creation
  const handleCreateShortlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !newShortlistName.trim()) return;
    try {
      await api.createShortlist(activeWorkspace.id, {
        name: newShortlistName.trim(),
        investorProfileId: activeProfile?.id || null,
      });
      setNewShortlistName("");
      setIsCreatingShortlist(false);
      // Refresh shortlists
      const slList = await api.getShortlists(activeWorkspace.id);
      setShortlists(slList);
    } catch (err: any) {
      showToast(err.message || "Failed to create watchlist", "error");
    }
  };

  // Handle Add to Shortlist
  const handleAddToShortlist = async (
    shortlistId: string,
    propertyId: string,
  ) => {
    if (!activeWorkspace) return;
    try {
      await api.addShortlistItem(activeWorkspace.id, shortlistId, {
        entityType: "property",
        entityId: propertyId,
      });
      showToast("Saved to watchlist successfully", "success");
      // Refresh shortlists
      const slList = await api.getShortlists(activeWorkspace.id);
      setShortlists(slList);
    } catch (err: any) {
      showToast(err.message || "Failed to add item to watchlist", "error");
    }
  };

  // Handle Remove from Shortlist
  const handleRemoveFromShortlist = async (
    shortlistId: string,
    itemId: string,
  ) => {
    if (!activeWorkspace) return;
    try {
      await api.removeShortlistItem(activeWorkspace.id, shortlistId, itemId);
      // Refresh shortlists
      const slList = await api.getShortlists(activeWorkspace.id);
      setShortlists(slList);
    } catch (err: any) {
      showToast(err.message || "Failed to remove item", "error");
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6 text-center text-text-muted font-mono text-xs">
        SELECT A WORKSPACE TO BEGIN OPPORTUNITY MATCHING.
      </div>
    );
  }

  // 1. If no profiles exist, show the Onboarding Mandate Form
  if (profiles.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="bg-bg-surface border border-border-default rounded-md p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
            <Layers className="h-5 w-5 text-accent-intelligence" />
            <h1 className="text-sm font-bold tracking-tight text-text-primary uppercase font-mono">
              Initialize Investment Mandate
            </h1>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed font-mono">
            Define your workspace investment constraints. The matching engine
            evaluates real estate yields, regulatory transaction fees, and risk
            tolerances dynamically to surface qualified deals.
          </p>

          <form onSubmit={handleCreateProfile} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pName"
                  className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono"
                >
                  Mandate Name
                </label>
                <input
                  id="pName"
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full bg-bg-base border border-border-default rounded-sm py-1.5 px-3 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence"
                />
              </div>

              <div>
                <label
                  htmlFor="pCapital"
                  className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono"
                >
                  Capital Available (Cash)
                </label>
                <input
                  id="pCapital"
                  type="number"
                  required
                  value={capitalAvailable}
                  onChange={(e) => setCapitalAvailable(Number(e.target.value))}
                  className="w-full bg-bg-base border border-border-default rounded-sm py-1.5 px-3 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="pCurrency"
                  className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono"
                >
                  Base Currency
                </label>
                <select
                  id="pCurrency"
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className="w-full bg-bg-base border border-border-default rounded-sm py-1.5 px-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence font-mono"
                >
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pRisk"
                  className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono"
                >
                  Risk Tolerance
                </label>
                <select
                  id="pRisk"
                  value={riskTolerance}
                  onChange={(e) => setRiskTolerance(e.target.value)}
                  className="w-full bg-bg-base border border-border-default rounded-sm py-1.5 px-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence font-mono"
                >
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pHorizon"
                  className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono"
                >
                  Horizon (Months)
                </label>
                <input
                  id="pHorizon"
                  type="number"
                  required
                  value={investmentHorizonMonths}
                  onChange={(e) =>
                    setInvestmentHorizonMonths(Number(e.target.value))
                  }
                  className="w-full bg-bg-base border border-border-default rounded-sm py-1.5 px-3 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="pPref"
                  className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono"
                >
                  Return Focus
                </label>
                <select
                  id="pPref"
                  value={incomeVsGrowthPreference}
                  onChange={(e) => setIncomeVsGrowthPreference(e.target.value)}
                  className="w-full bg-bg-base border border-border-default rounded-sm py-1.5 px-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence font-mono"
                >
                  <option value="income">Yield Focus (Income)</option>
                  <option value="growth">Appreciation Focus (Growth)</option>
                  <option value="balanced">Balanced</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pFinancing"
                  className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono"
                >
                  Leverage/Financing
                </label>
                <select
                  id="pFinancing"
                  value={financingPreference}
                  onChange={(e) => setFinancingPreference(e.target.value)}
                  className="w-full bg-bg-base border border-border-default rounded-sm py-1.5 px-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-intelligence font-mono"
                >
                  <option value="cash">All Cash (0% LTV)</option>
                  <option value="mortgage">Mortgage Financed</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>

              <div>
                <span className="block text-[10px] uppercase tracking-wider text-text-secondary mb-1.5 font-semibold font-mono">
                  Target Country
                </span>
                <div className="flex gap-4 pt-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-text-primary cursor-pointer font-mono">
                    <input
                      type="checkbox"
                      checked={targetCountries.includes("AE")}
                      onChange={(e) => {
                        if (e.target.checked)
                          setTargetCountries([...targetCountries, "AE"]);
                        else
                          setTargetCountries(
                            targetCountries.filter((c) => c !== "AE"),
                          );
                      }}
                      className="cursor-pointer focus:ring-accent-intelligence"
                    />
                    AE (UAE)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-text-primary cursor-pointer font-mono">
                    <input
                      type="checkbox"
                      checked={targetCountries.includes("ES")}
                      onChange={(e) => {
                        if (e.target.checked)
                          setTargetCountries([...targetCountries, "ES"]);
                        else
                          setTargetCountries(
                            targetCountries.filter((c) => c !== "ES"),
                          );
                      }}
                      className="cursor-pointer focus:ring-accent-intelligence"
                    />
                    ES (Spain)
                  </label>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-danger-soft border border-danger text-danger text-xs font-mono p-3 rounded-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-intelligence hover:bg-accent-intelligence/90 text-text-inverse py-2 px-4 rounded-sm text-xs font-mono uppercase tracking-wider font-semibold flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-intelligence focus-visible:ring-offset-2 outline-none"
            >
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin text-text-inverse" />
              )}
              Save & Initialize Matcher
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. If profiles exist, render the Deal Finder dashboard
  return (
    <div className="p-6 space-y-6">
      {/* Top Header / Profile Info */}
      <div className="bg-bg-surface border border-border-default rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
            Mandate Overview
          </span>
          <h1 className="text-sm font-bold text-text-primary font-mono uppercase tracking-tight flex items-center gap-1.5">
            <Search className="h-4 w-4 text-accent-intelligence" />
            Opportunity Matching Engine
          </h1>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="bg-bg-base border border-border-subtle rounded px-3 py-1.5 space-y-0.5">
            <span className="block text-[8px] font-mono text-text-muted uppercase">
              Capital Available
            </span>
            <span className="font-bold text-text-primary font-mono">
              {Number(activeProfile?.capitalAvailable).toLocaleString()}{" "}
              {activeProfile?.baseCurrency}
            </span>
          </div>

          <div className="bg-bg-base border border-border-subtle rounded px-3 py-1.5 space-y-0.5">
            <span className="block text-[8px] font-mono text-text-muted uppercase">
              Risk Profile
            </span>
            <span className="font-bold text-text-primary font-mono uppercase text-[10px] flex items-center gap-1">
              <Shield className="h-3 w-3 text-accent-intelligence" />
              {activeProfile?.riskTolerance}
            </span>
          </div>

          <div className="bg-bg-base border border-border-subtle rounded px-3 py-1.5 space-y-0.5">
            <span className="block text-[8px] font-mono text-text-muted uppercase">
              Focus Mode
            </span>
            <span className="font-bold text-text-primary font-mono uppercase text-[10px] flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-accent-intelligence" />
              {activeProfile?.incomeVsGrowthPreference}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Center Column: Matched Deals */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 font-mono flex items-center justify-between">
              <span>Top Investment Matches</span>
              <span className="text-[10px] text-text-muted font-normal normal-case">
                {deals.length} opportunities matched
              </span>
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-text-muted font-mono text-xs gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-accent-intelligence" />
                SEARCHING MATCHED OPPORTUNITIES...
              </div>
            ) : deals.length > 0 ? (
              <div className="divide-y divide-border-subtle">
                {deals.map((deal) => (
                  <div
                    key={deal.property.id}
                    className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-accent-intelligence-soft border border-accent-intelligence text-accent-intelligence text-[10px] font-semibold font-mono py-0.5 px-2 rounded-xs">
                          {deal.matchScore}% MATCH
                        </span>
                        <span className="text-text-primary text-xs font-bold font-mono">
                          {deal.property.building?.name || "Manual Underwrite"}
                        </span>
                        <span className="text-[10px] font-mono text-text-muted uppercase">
                          ({deal.property.propertyType})
                        </span>
                      </div>

                      <div className="text-[11px] text-text-secondary font-mono">
                        {deal.property.building?.district?.name},{" "}
                        {deal.property.building?.city?.name}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 pt-1.5 text-[10px] font-mono text-text-muted uppercase">
                        <div>
                          Price:{" "}
                          <span className="text-text-primary font-bold">
                            {deal.listing.priceAmount.toLocaleString()}{" "}
                            {deal.listing.priceCurrency}
                          </span>
                        </div>
                        <div>
                          Cash Required:{" "}
                          <span className="text-text-primary font-bold">
                            {deal.matchingDetails.cashRequired.toLocaleString()}{" "}
                            {deal.listing.priceCurrency}
                          </span>
                        </div>
                        <div>
                          Proxy Yield:{" "}
                          <span className="text-text-primary font-bold">
                            {deal.matchingDetails.grossYieldEstimate}%
                          </span>
                          <span className="block text-[8px] text-text-muted normal-case mt-0.5">
                            *Estimated using standard assumptions, not live comps data.
                          </span>
                        </div>
                        <div>
                          LTV:{" "}
                          <span className="text-text-primary font-bold">
                            {deal.matchingDetails.ltvPercentage !== undefined
                              ? `${deal.matchingDetails.ltvPercentage}% (${deal.matchingDetails.useMortgage ? "Mortgage" : "Cash"})`
                              : deal.matchingDetails.useMortgage
                                ? "75% (Mortgage)"
                                : "0% (Cash)"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                      {shortlists.length > 0 ? (
                        <div className="relative shortlist-dropdown-container">
                          <button
                            onClick={() =>
                              setOpenMenuPropertyId(
                                openMenuPropertyId === deal.property.id
                                  ? null
                                  : deal.property.id,
                              )
                            }
                            className="bg-bg-base hover:bg-bg-surface-elevated text-text-primary border border-border-default rounded-sm py-1.5 px-3 text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer focus-visible:ring-1 focus-visible:ring-accent-intelligence outline-none"
                            aria-label={`Save ${deal.property.building?.name || "property"} to watchlist`}
                            aria-haspopup="true"
                            aria-expanded={
                              openMenuPropertyId === deal.property.id
                            }
                          >
                            <Bookmark className="h-3.5 w-3.5" />
                            Save
                          </button>
                          <div
                            className={`absolute right-0 top-full mt-1 ${openMenuPropertyId === deal.property.id ? "" : "hidden"} bg-bg-surface-elevated border border-border-strong rounded shadow-lg py-1 z-10 w-44`}
                            role="menu"
                          >
                            {shortlists.map((sl) => (
                              <button
                                key={sl.id}
                                role="menuitem"
                                onClick={() => {
                                  handleAddToShortlist(sl.id, deal.property.id);
                                  setOpenMenuPropertyId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-hover hover:text-text-primary font-mono truncate cursor-pointer"
                              >
                                {sl.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setIsCreatingShortlist(true);
                          }}
                          className="bg-bg-base hover:bg-bg-surface-elevated text-text-muted border border-border-default rounded-sm py-1.5 px-3 text-xs font-mono uppercase tracking-wider flex items-center gap-1 cursor-pointer focus-visible:ring-1 focus-visible:ring-accent-intelligence outline-none"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          New List
                        </button>
                      )}

                      <a
                        href={`/property/${deal.property.id}`}
                        className="bg-accent-intelligence hover:bg-accent-intelligence/90 text-text-inverse rounded-sm py-1.5 px-3 text-xs font-mono uppercase tracking-wider flex items-center gap-0.5 font-semibold focus-visible:ring-1 focus-visible:ring-accent-intelligence outline-none"
                      >
                        Inspect
                        <ChevronRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-text-muted font-mono text-xs">
                NO PROPERTIES MATCH YOUR INVESTMENT CRITERIA.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Watchlists & Shortlists */}
        <div className="space-y-6">
          <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest font-mono flex items-center gap-1.5">
                <Bookmark className="h-4 w-4 text-accent-intelligence" />
                Active Watchlists
              </h2>
              <button
                onClick={() => setIsCreatingShortlist(true)}
                className="text-accent-intelligence hover:text-accent-intelligence/80 p-0.5 cursor-pointer focus-visible:ring-1 focus-visible:ring-accent-intelligence outline-none rounded-xs"
                title="Create List"
                aria-label="Create Watchlist"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {isCreatingShortlist && (
              <form
                onSubmit={handleCreateShortlist}
                className="bg-bg-base border border-border-default rounded p-3 space-y-2"
              >
                <label
                  htmlFor="watchlistName"
                  className="block text-[9px] font-mono text-text-muted uppercase tracking-wider"
                >
                  List Name
                </label>
                <input
                  id="watchlistName"
                  type="text"
                  required
                  placeholder="e.g. Dubai High Yields"
                  value={newShortlistName}
                  onChange={(e) => setNewShortlistName(e.target.value)}
                  className="w-full bg-bg-surface-elevated border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence font-mono"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsCreatingShortlist(false)}
                    className="px-2 py-0.5 text-[10px] bg-bg-surface-elevated border border-border-subtle text-text-secondary rounded font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-0.5 text-[10px] bg-success text-text-inverse rounded font-mono font-semibold"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {shortlists.length > 0 ? (
              <div className="space-y-4">
                {shortlists.map((sl) => (
                  <div
                    key={sl.id}
                    className="bg-bg-base border border-border-subtle rounded p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-border-subtle pb-1">
                      <span className="text-xs font-bold text-text-primary font-mono">
                        {sl.name}
                      </span>
                      <span className="text-[9px] text-text-muted font-mono">
                        {sl.items?.length || 0} items
                      </span>
                    </div>

                    {sl.items && sl.items.length > 0 ? (
                      <div className="space-y-1.5">
                        {sl.items.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs font-mono py-1"
                          >
                            <span className="text-text-primary truncate max-w-[150px]">
                              {item.entityId}
                            </span>
                            <button
                              onClick={() =>
                                handleRemoveFromShortlist(sl.id, item.id)
                              }
                              className="text-text-muted hover:text-danger p-0.5 cursor-pointer focus-visible:ring-1 focus-visible:ring-accent-intelligence outline-none rounded-xs"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-text-muted font-mono py-1">
                        No properties shortlisted yet.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-text-muted font-mono text-[10px]">
                NO WATCHLISTS CREATED YET.
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 p-4 rounded border text-xs font-mono max-w-sm shadow-xl flex items-center gap-2 animate-slide-in ${
            toast.type === "success"
              ? "bg-success/15 border-success text-success"
              : "bg-danger/15 border-danger text-danger"
          }`}
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
