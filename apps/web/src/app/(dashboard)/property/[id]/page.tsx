"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTerminal } from "../../../../context/TerminalContext";
import { api } from "../../../../lib/api";
import { ExportUnderwriteButton } from "../../deals/_components/ExportUnderwriteButton";
import {
  Calculator,
  ArrowRight,
  Loader2,
  AlertCircle,
  Database,
} from "lucide-react";

export default function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { activeWorkspace, activeProfile } = useTerminal();

  const propertyId = resolvedParams.id;

  const [countryCode, setCountryCode] = useState("AE");
  const [purchasePrice, setPurchasePrice] = useState(1200000);
  const [grossRentalIncomeAnnual, setGrossRentalIncomeAnnual] = useState(96000);
  const [serviceChargePerSqm, setServiceChargePerSqm] = useState(25);
  const [interiorAreaSqm, setInteriorAreaSqm] = useState(80);
  const [isOffPlan, setIsOffPlan] = useState(false);
  const [useFinancing, setUseFinancing] = useState(true);
  const [downPaymentPct, setDownPaymentPct] = useState(0.25);
  const [interestRate, setInterestRate] = useState(0.045);
  const [termMonths, setTermMonths] = useState(300);

  const [result, setResult] = useState<any>(null);
  const [underwriteRunId, setUnderwriteRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [evalLoading, setEvalLoading] = useState(false);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);

  const [memoJob, setMemoJob] = useState<any>(null);
  const [jobsHistory, setJobsHistory] = useState<any[]>([]);
  const [memoLoading, setMemoLoading] = useState(false);

  const loadJobsHistory = async () => {
    if (!activeWorkspace) return;
    try {
      const data = await api.getJobs(activeWorkspace.id);
      const propertyJobs = data.filter(
        (j: any) => j.inputJson?.propertyId === propertyId,
      );
      setJobsHistory(propertyJobs);

      const active = propertyJobs.find((j: any) =>
        ["queued", "running"].includes(j.status),
      );
      if (active) {
        setMemoJob(active);
      } else {
        const awaiting = propertyJobs.find((j: any) =>
          ["awaiting_approval", "blocked"].includes(j.status),
        );
        if (awaiting) {
          setMemoJob(awaiting);
        }
      }
    } catch (err) {
      console.error("Failed to load jobs history", err);
    }
  };

  useEffect(() => {
    loadJobsHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, propertyId]);

  useEffect(() => {
    if (!memoJob || !["queued", "running"].includes(memoJob.status)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await api.getJob(activeWorkspace.id, memoJob.id);
        setMemoJob(updated);
        if (!["queued", "running"].includes(updated.status)) {
          clearInterval(interval);
          loadJobsHistory();
        }
      } catch (err) {
        console.error("Failed to poll job status", err);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoJob, activeWorkspace]);

  const handleGenerateMemo = async () => {
    if (!activeWorkspace || !propertyId) return;
    setMemoLoading(true);
    try {
      const job = await api.generateMemo(activeWorkspace.id, propertyId);
      setMemoJob(job);
      loadJobsHistory();
    } catch (err) {
      console.error(err);
    } finally {
      setMemoLoading(false);
    }
  };

  const handleApproveMemo = async (jobId: string) => {
    if (!activeWorkspace) return;
    try {
      await api.approveMemo(activeWorkspace.id, jobId);
      loadJobsHistory();
      setMemoJob(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectMemo = async (jobId: string) => {
    if (!activeWorkspace) return;
    try {
      await api.rejectMemo(activeWorkspace.id, jobId);
      loadJobsHistory();
      setMemoJob(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerWorkflow = async () => {
    if (!activeWorkspace || !propertyId || !activeProfile) return;
    setMemoLoading(true);
    try {
      const job = await api.triggerWorkflow(
        activeWorkspace.id,
        propertyId,
        activeProfile.id,
      );
      setMemoJob(job);
      loadJobsHistory();
    } catch (err) {
      console.error(err);
    } finally {
      setMemoLoading(false);
    }
  };

  const handleApproveScreening = async (jobId: string) => {
    if (!activeWorkspace) return;
    try {
      const updated = await api.approveScreening(activeWorkspace.id, jobId);
      setMemoJob(updated);
      loadJobsHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectScreening = async (jobId: string) => {
    if (!activeWorkspace) return;
    try {
      await api.rejectScreening(activeWorkspace.id, jobId);
      loadJobsHistory();
      setMemoJob(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveWorkflowMemo = async (jobId: string) => {
    if (!activeWorkspace) return;
    try {
      await api.approveWorkflowMemo(activeWorkspace.id, jobId);
      loadJobsHistory();
      setMemoJob(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectWorkflowMemo = async (jobId: string) => {
    if (!activeWorkspace) return;
    try {
      await api.rejectWorkflowMemo(activeWorkspace.id, jobId);
      loadJobsHistory();
      setMemoJob(null);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPropertyEvidence = async () => {
    if (!activeWorkspace || !propertyId) return;
    try {
      const data = await api.getEvidence(activeWorkspace.id, propertyId);
      setEvidenceList(data);
    } catch (err) {
      console.error("Failed to load property evidence ledger", err);
    }
  };

  useEffect(() => {
    loadPropertyEvidence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, propertyId]);

  const runUnderwrite = async () => {
    setError("");
    setLoading(true);
    try {
      const payload = {
        workspaceId: activeWorkspace?.id,
        propertyId: propertyId || undefined,
        countryCode,
        currency:
          activeProfile?.baseCurrency ?? (countryCode === "AE" ? "AED" : "EUR"),
        purchasePrice,
        grossRentalIncomeAnnual,
        serviceChargeValue: serviceChargePerSqm,
        serviceChargeUnit:
          countryCode === "AE" ? "per_sqft_annual" : "per_sqm_monthly",
        interiorAreaSqm,
        isOffPlan,
        useFinancing,
        downPaymentPct,
        interestRate,
        termMonths,
      };

      const res = await api.underwrite(payload);
      setResult(res);
      if (res && res.id) {
        setUnderwriteRunId(res.id);
      }
    } catch (err: any) {
      setError(err.message || "Underwriting calculation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchPropertyData = async () => {
      if (!activeWorkspace || !propertyId) return;
      try {
        const deals = await api.searchDeals(
          activeWorkspace.id,
          activeProfile?.id || undefined,
        );
        const match = deals.find((d: any) => d.property.id === propertyId);
        if (match) {
          setCountryCode(match.property.country.countryCode);
          setPurchasePrice(Number(match.listing.priceAmount));
          const area = match.property.interiorAreaSqm
            ? Number(match.property.interiorAreaSqm)
            : 80;
          setInteriorAreaSqm(area);
          setIsOffPlan(match.property.propertyType === "off-plan");

          // Calculate annual rent using proxy formula matching deal finder
          const calculatedRent =
            area *
            (match.property.country.countryCode === "AE" ? 200 : 15) *
            12;
          setGrossRentalIncomeAnnual(calculatedRent);

          // Default service charges
          setServiceChargePerSqm(
            match.property.country.countryCode === "AE" ? 25 : 1.5,
          );
        } else if (activeProfile) {
          // Fallback defaults if no match found
          setCountryCode(activeProfile.baseCurrency === "EUR" ? "ES" : "AE");
          setPurchasePrice(
            activeProfile.baseCurrency === "EUR" ? 450000 : 1200000,
          );
          setGrossRentalIncomeAnnual(
            activeProfile.baseCurrency === "EUR" ? 32000 : 96000,
          );
        }
      } catch (err) {
        console.error("Failed to load property details", err);
      }
    };

    fetchPropertyData();
  }, [activeWorkspace, activeProfile, propertyId]);

  const handleRunCommittee = async () => {
    if (!activeWorkspace || !activeProfile || !underwriteRunId) return;
    setEvalLoading(true);
    try {
      await api.evaluate({
        workspaceId: activeWorkspace.id,
        investorProfileId: activeProfile.id,
        underwriteRunId,
      });

      router.push(`/committee?underwriteRunId=${underwriteRunId}`);
    } catch (err) {
      console.error(err);
    } finally {
      setEvalLoading(false);
    }
  };

  if (!activeWorkspace || !activeProfile) {
    return (
      <div className="p-6">
        <div className="max-w-md bg-bg-surface border border-warning/30 rounded-md p-6 space-y-4">
          <div className="flex items-center gap-2 text-warning">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-xs font-bold uppercase tracking-widest">
              Mandate Context Required
            </h2>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed font-mono">
            Please select both an Active Workspace and an Active Investor
            Profile in the sidebar to run underwrites or committee evaluations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border-default pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-text-primary tracking-tight">
            UNDERWRITING ENGINE
          </h1>
          <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mt-1">
            Property ID: {propertyId || "New Model"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {underwriteRunId && (
            <ExportUnderwriteButton
              workspaceId={activeWorkspace.id}
              underwriteRunId={underwriteRunId}
              propertyName={result?.propertyName || "Property"}
            />
          )}
          <button
            onClick={runUnderwrite}
            disabled={loading}
            className="bg-bg-surface-elevated border border-border-default hover:bg-bg-surface-elevated/85 text-text-primary font-mono px-3 py-1.5 rounded-sm text-xs transition-colors duration-120 flex items-center gap-1.5 cursor-pointer font-semibold"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Calculator className="h-3.5 w-3.5 text-accent-intelligence" />
            )}
            RECOMPUTE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 bg-bg-surface border border-border-default rounded-md p-5 space-y-4 h-fit">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2">
            Asset Parameters
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                Country
              </label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence"
              >
                <option value="AE" className="bg-bg-surface text-text-primary">
                  UAE (AED)
                </option>
                <option value="ES" className="bg-bg-surface text-text-primary">
                  Spain (EUR)
                </option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                Project Stage
              </label>
              <select
                value={isOffPlan ? "off-plan" : "completed"}
                onChange={(e) => setIsOffPlan(e.target.value === "off-plan")}
                className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence"
              >
                <option
                  value="completed"
                  className="bg-bg-surface text-text-primary"
                >
                  Completed
                </option>
                <option
                  value="off-plan"
                  className="bg-bg-surface text-text-primary"
                >
                  Off-Plan
                </option>
              </select>
            </div>
          </div>

          <div className="space-y-4 bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-md">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
                  Purchase Price: <span className="text-text-primary font-bold">{purchasePrice.toLocaleString()} {countryCode === "AE" ? "AED" : "EUR"}</span>
                </label>
              </div>
              <input
                type="range"
                min={purchasePrice * 0.5}
                max={purchasePrice * 1.5}
                step="10000"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                className="w-full accent-accent-intelligence cursor-pointer h-1 bg-bg-base rounded-lg appearance-none"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
                  Annual Rent: <span className="text-text-primary font-bold">{grossRentalIncomeAnnual.toLocaleString()} {countryCode === "AE" ? "AED" : "EUR"}</span>
                </label>
              </div>
              <input
                type="range"
                min={grossRentalIncomeAnnual * 0.5}
                max={grossRentalIncomeAnnual * 1.5}
                step="2000"
                value={grossRentalIncomeAnnual}
                onChange={(e) => setGrossRentalIncomeAnnual(Number(e.target.value))}
                className="w-full accent-accent-intelligence cursor-pointer h-1 bg-bg-base rounded-lg appearance-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                  Svc Charge ({countryCode === "AE" ? "AED/sqft" : "EUR/sqm"})
                </label>
                <input
                  type="number"
                  value={serviceChargePerSqm}
                  onChange={(e) => setServiceChargePerSqm(Number(e.target.value))}
                  className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                  Area (Sqm)
                </label>
                <input
                  type="number"
                  value={interiorAreaSqm}
                  onChange={(e) => setInteriorAreaSqm(Number(e.target.value))}
                  className="w-full bg-bg-base border border-border-default rounded-sm p-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-intelligence font-mono"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-3">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-text-secondary font-semibold">
                Leveraged Financing
              </label>
              <input
                type="checkbox"
                checked={useFinancing}
                onChange={(e) => setUseFinancing(e.target.checked)}
                className="cursor-pointer accent-accent-intelligence"
              />
            </div>

            {useFinancing && (
              <div className="space-y-4 bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-md mt-2">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
                      Downpayment: <span className="text-text-primary font-bold">{(downPaymentPct * 100).toFixed(0)}%</span>
                    </label>
                  </div>
                  <input
                    type="range"
                    min="0.10"
                    max="0.80"
                    step="0.05"
                    value={downPaymentPct}
                    onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                    className="w-full accent-accent-intelligence cursor-pointer h-1 bg-bg-base rounded-lg appearance-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
                      Interest Rate: <span className="text-text-primary font-bold">{(interestRate * 100).toFixed(2)}%</span>
                    </label>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.12"
                    step="0.001"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                    className="w-full accent-accent-intelligence cursor-pointer h-1 bg-bg-base rounded-lg appearance-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1">
                    Term: <span className="text-text-primary font-bold">{termMonths} Months</span>
                  </label>
                  <input
                    type="range"
                    min="60"
                    max="360"
                    step="12"
                    value={termMonths}
                    onChange={(e) => setTermMonths(Number(e.target.value))}
                    className="w-full accent-accent-intelligence cursor-pointer h-1 bg-bg-base rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Property Evidence Ledger */}
          <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center gap-2">
              <Database className="h-4 w-4 text-accent-intelligence" />
              <span>Property Evidence Ledger</span>
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {evidenceList && evidenceList.length > 0 ? (
                evidenceList.map((ev: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-bg-base border border-border-subtle rounded-sm text-xs font-mono space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-accent-intelligence uppercase text-[10px]">
                        {ev.sourceType}
                      </span>
                      <span className="text-[9px] text-text-muted">
                        {new Date(ev.freshness).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-text-primary font-sans font-semibold">
                      {ev.title}
                    </div>
                    {ev.snippet && (
                      <div className="text-[10px] text-text-secondary leading-relaxed p-1.5 bg-bg-surface border border-border-subtle rounded-xs">
                        {ev.snippet}
                      </div>
                    )}
                    <div className="text-right text-[9px] text-text-muted">
                      Confidence: {(Number(ev.confidence) * 100).toFixed(0)}%
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-text-muted text-[10px]">
                  No document or comps evidence linked to this asset. Upload
                  lease files to register evidence.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-md p-4 flex gap-2 items-start text-xs text-danger font-mono">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result ? (
            <div className="space-y-6">
              <div className="bg-bg-surface border border-border-default rounded-md p-5">
                <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4">
                  Financial Performance Summary
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-bg-base p-4 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      Net Yield
                    </span>
                    <span className="text-lg font-bold text-success font-mono">
                      {(result.metrics?.netYield * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="bg-bg-base p-4 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      Gross Yield
                    </span>
                    <span className="text-lg font-bold text-text-primary font-mono">
                      {(result.metrics?.grossYield * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="bg-bg-base p-4 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      DSCR Ratio
                    </span>
                    <span className="text-lg font-bold text-text-primary font-mono">
                      {result.metrics?.dscr !== null
                        ? Number(result.metrics.dscr).toFixed(2)
                        : "N/A"}
                    </span>
                  </div>
                  <div className="bg-bg-base p-4 border border-border-subtle rounded-sm">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
                      Acquisition Costs
                    </span>
                    <span className="text-sm font-bold text-text-primary font-mono block mt-1">
                      {Number(result.totalAcquisitionCosts).toLocaleString()}{" "}
                      {result.currency}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-bg-surface border border-border-default rounded-md p-5">
                <div className="flex justify-between items-end border-b border-border-subtle pb-2 mb-4">
                  <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest">
                    Cost Breakdown & Diligence Checklist
                  </h2>
                  <span className="text-[8px] text-text-muted normal-case font-mono">*Estimated using standard assumptions</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-[10px] font-mono text-text-muted uppercase tracking-wider border-b border-border-subtle pb-1 mb-2">
                      Acquisition Costs
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between font-mono">
                        <span className="text-text-secondary">
                          Transfer Tax / DLD Fee
                        </span>
                        <span className="text-text-primary font-semibold">
                          {Number(
                            result.acquisitionCostsDetails?.transferTaxOrDldFee,
                          ).toLocaleString()}{" "}
                          {result.currency}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-text-secondary">
                          Registration Fee
                        </span>
                        <span className="text-text-primary font-semibold">
                          {Number(
                            result.acquisitionCostsDetails?.registrationFee,
                          ).toLocaleString()}{" "}
                          {result.currency}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-text-secondary">
                          Broker Agency Fee
                        </span>
                        <span className="text-text-primary font-semibold">
                          {Number(
                            result.acquisitionCostsDetails?.brokerFee,
                          ).toLocaleString()}{" "}
                          {result.currency}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-mono text-text-muted uppercase tracking-wider border-b border-border-subtle pb-1 mb-2">
                      Ongoing Annual Costs
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between font-mono">
                        <span className="text-text-secondary">
                          Property Tax
                        </span>
                        <span className="text-text-primary font-semibold">
                          {Number(
                            result.ongoingCosts?.propertyTaxAnnual,
                          ).toLocaleString()}{" "}
                          {result.currency}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-text-secondary">
                          Service Charges
                        </span>
                        <span className="text-text-primary font-semibold">
                          {Number(
                            result.ongoingCosts?.serviceChargeAnnual,
                          ).toLocaleString()}{" "}
                          {result.currency}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-text-secondary">
                          Maintenance Reserve
                        </span>
                        <span className="text-text-primary font-semibold">
                          {Number(
                            result.ongoingCosts?.maintenanceAnnual,
                          ).toLocaleString()}{" "}
                          {result.currency}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-bg-surface border border-border-default rounded-md p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">
                    Challenge Deal Assumptions
                  </h3>
                  <p className="text-[11px] text-text-secondary mt-1">
                    Submit these underwriting figures to the AI Committee for
                    risk objection mapping and buy verdict.
                  </p>
                </div>
                <button
                  onClick={handleRunCommittee}
                  disabled={evalLoading || !underwriteRunId}
                  className="bg-accent-intelligence hover:bg-accent-intelligence/90 active:bg-accent-intelligence/95 disabled:bg-border-default disabled:text-text-muted disabled:cursor-not-allowed text-text-inverse font-semibold py-2 px-4 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors duration-120 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {evalLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "RUN COMMITTEE EVAL"
                  )}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Coordinated Multi-Agent Workflow Operations Center */}
              <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-5">
                <div className="flex justify-between items-center border-b border-border-subtle pb-2">
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                    <Loader2
                      className={`h-4 w-4 text-accent-intelligence ${memoJob && ["queued", "running"].includes(memoJob.status) ? "animate-spin" : ""}`}
                    />
                    <span>Multi-Agent Workflow Operations</span>
                  </h3>
                  {memoJob && (
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-accent-intelligence/20 text-accent-intelligence">
                      {memoJob.jobType === "multi_agent_workflow"
                        ? `Workflow: ${memoJob.status}`
                        : `Memo: ${memoJob.status}`}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Coordinate screening, diligence evidence verification, and
                  investment memo synthesis with strict human review checkpoints
                  (Gate A: Screening Approval, Gate B: Memo Finalization).
                </p>

                {!memoJob ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleTriggerWorkflow}
                      disabled={memoLoading || !underwriteRunId}
                      className="bg-accent-intelligence hover:bg-accent-intelligence/90 text-text-inverse font-mono py-2 px-4 rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors duration-120 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {memoLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Trigger Multi-Agent Workflow"
                      )}
                    </button>

                    <button
                      onClick={handleGenerateMemo}
                      disabled={memoLoading || !underwriteRunId}
                      className="bg-bg-surface-elevated border border-border-default hover:bg-bg-surface-elevated/85 text-text-primary font-mono py-2 px-4 rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors duration-120 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Draft Memo Agent Only
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {memoJob.jobType === "multi_agent_workflow" ? (
                      <div className="space-y-4">
                        <div className="bg-bg-base border border-border-subtle p-4 rounded-md space-y-3">
                          <div className="text-[10px] font-mono text-text-muted uppercase font-bold tracking-wider">
                            Active Workflow Pipeline Steps
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {/* Screening Step */}
                            <div
                              className={`p-2.5 border rounded-sm font-mono text-[10px] ${
                                memoJob.resultRefJson?.step === "screening" &&
                                memoJob.status === "awaiting_approval"
                                  ? "border-warning bg-warning/5 text-warning-hover"
                                  : memoJob.resultRefJson?.screeningResult
                                    ? "border-success bg-success/5 text-success"
                                    : memoJob.status === "blocked" &&
                                        memoJob.resultRefJson?.step ===
                                          "screening"
                                      ? "border-danger bg-danger/5 text-danger"
                                      : ["queued", "running"].includes(
                                            memoJob.status,
                                          ) &&
                                          memoJob.resultRefJson?.step ===
                                            "screening"
                                        ? "border-accent-intelligence bg-accent-intelligence/5 text-accent-intelligence animate-pulse"
                                        : "border-border-subtle text-text-muted"
                              }`}
                            >
                              <div className="font-bold uppercase tracking-wider mb-1">
                                1. Screening Agent
                              </div>
                              <div>
                                {memoJob.resultRefJson?.screeningResult ? (
                                  <span>
                                    Score:{" "}
                                    {
                                      memoJob.resultRefJson.screeningResult
                                        .score
                                    }
                                    /100 (
                                    {
                                      memoJob.resultRefJson.screeningResult
                                        .verdict
                                    }
                                    )
                                  </span>
                                ) : memoJob.status === "blocked" ? (
                                  <span>BLOCKED</span>
                                ) : memoJob.resultRefJson?.step ===
                                    "screening" &&
                                  memoJob.status === "running" ? (
                                  <span>Screening...</span>
                                ) : (
                                  <span>Pending</span>
                                )}
                              </div>
                            </div>

                            {/* Diligence Step */}
                            <div
                              className={`p-2.5 border rounded-sm font-mono text-[10px] ${
                                memoJob.resultRefJson?.step === "diligence" &&
                                ["queued", "running"].includes(memoJob.status)
                                  ? "border-accent-intelligence bg-accent-intelligence/5 text-accent-intelligence animate-pulse"
                                  : memoJob.resultRefJson?.diligenceResult
                                    ? "border-success bg-success/5 text-success"
                                    : "border-border-subtle text-text-muted"
                              }`}
                            >
                              <div className="font-bold uppercase tracking-wider mb-1">
                                2. Diligence Agent
                              </div>
                              <div>
                                {memoJob.resultRefJson?.diligenceResult ? (
                                  <span>
                                    Risk:{" "}
                                    {
                                      memoJob.resultRefJson.diligenceResult
                                        .riskLevel
                                    }{" "}
                                    (Leases:{" "}
                                    {
                                      memoJob.resultRefJson.diligenceResult
                                        .verifiedLeasesCount
                                    }
                                    )
                                  </span>
                                ) : memoJob.resultRefJson?.step ===
                                    "diligence" &&
                                  memoJob.status === "running" ? (
                                  <span>Running due diligence...</span>
                                ) : (
                                  <span>Pending Gate A</span>
                                )}
                              </div>
                            </div>

                            {/* Memo Step */}
                            <div
                              className={`p-2.5 border rounded-sm font-mono text-[10px] ${
                                memoJob.resultRefJson?.step === "memo" &&
                                memoJob.status === "awaiting_approval"
                                  ? "border-warning bg-warning/5 text-warning-hover"
                                  : memoJob.status === "completed"
                                    ? "border-success bg-success/5 text-success"
                                    : memoJob.resultRefJson?.step === "memo" &&
                                        memoJob.status === "running"
                                      ? "border-accent-intelligence bg-accent-intelligence/5 text-accent-intelligence animate-pulse"
                                      : "border-border-subtle text-text-muted"
                              }`}
                            >
                              <div className="font-bold uppercase tracking-wider mb-1">
                                3. Memo Agent
                              </div>
                              <div>
                                {memoJob.status === "completed" ? (
                                  <span>Finalized</span>
                                ) : memoJob.resultRefJson?.step === "memo" &&
                                  memoJob.status === "awaiting_approval" ? (
                                  <span>Memo Staged</span>
                                ) : memoJob.resultRefJson?.step === "memo" &&
                                  memoJob.status === "running" ? (
                                  <span>Compiling draft...</span>
                                ) : (
                                  <span>Pending</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {memoJob.status === "blocked" && (
                          <div className="bg-danger/10 border border-danger/30 rounded-md p-4 space-y-2 text-xs font-mono text-danger">
                            <div className="font-bold uppercase tracking-wider">
                              Pipeline Blocked
                            </div>
                            <p>{memoJob.errorMessage}</p>
                            <button
                              onClick={() => handleApproveScreening(memoJob.id)}
                              className="bg-danger text-text-inverse hover:bg-danger/90 font-semibold py-1 px-3 rounded-sm text-[10px] uppercase tracking-wider transition-colors duration-120 cursor-pointer"
                            >
                              Retry screening step
                            </button>
                          </div>
                        )}

                        {memoJob.status === "awaiting_approval" &&
                          memoJob.resultRefJson?.step === "screening" &&
                          memoJob.resultRefJson?.screeningResult && (
                            <div className="bg-bg-base border border-warning/30 p-4 rounded-md space-y-4">
                              <div className="text-[10px] font-mono text-warning uppercase font-bold border-b border-border-subtle pb-2">
                                GATE A CHECKPOINT: SCREENING REPORT REVIEW
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                <div>
                                  <span className="text-text-muted">
                                    Screening Fit Score:
                                  </span>
                                  <span className="block text-sm font-bold text-text-primary">
                                    {
                                      memoJob.resultRefJson.screeningResult
                                        .score
                                    }
                                    /100
                                  </span>
                                </div>
                                <div>
                                  <span className="text-text-muted">
                                    Screening Verdict:
                                  </span>
                                  <span className="block text-sm font-bold text-success uppercase">
                                    {
                                      memoJob.resultRefJson.screeningResult
                                        .verdict
                                    }
                                  </span>
                                </div>
                              </div>

                              <div className="bg-bg-surface p-3 border border-border-subtle rounded-sm text-xs font-sans leading-relaxed text-text-secondary">
                                <strong>Screening Thesis:</strong>{" "}
                                {memoJob.resultRefJson.screeningResult.thesis}
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleApproveScreening(memoJob.id)
                                  }
                                  className="bg-success text-text-inverse hover:bg-success/90 font-semibold py-1.5 px-4 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors duration-120 cursor-pointer"
                                >
                                  Approve Screening & Proceed
                                </button>
                                <button
                                  onClick={() =>
                                    handleRejectScreening(memoJob.id)
                                  }
                                  className="bg-danger text-text-inverse hover:bg-danger/90 font-semibold py-1.5 px-4 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors duration-120 cursor-pointer"
                                >
                                  Reject & Terminate Workflow
                                </button>
                              </div>
                            </div>
                          )}

                        {memoJob.status === "awaiting_approval" &&
                          memoJob.resultRefJson?.step === "memo" &&
                          memoJob.resultRefJson?.memoResult && (
                            <div className="space-y-4">
                              <div className="bg-bg-base border border-warning/30 p-4 rounded-md space-y-3 text-xs font-mono">
                                <div className="text-[10px] text-warning uppercase font-bold border-b border-border-subtle pb-2">
                                  GATE B CHECKPOINT: INVESTMENT MEMORANDUM
                                  REVIEW
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                  <div>
                                    <span className="text-text-muted font-bold block">
                                      1. SCREENING FIT
                                    </span>
                                    <span>
                                      Score:{" "}
                                      {
                                        memoJob.resultRefJson.screeningResult
                                          ?.score
                                      }
                                      /100 (
                                      {
                                        memoJob.resultRefJson.screeningResult
                                          ?.verdict
                                      }
                                      )
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-text-muted font-bold block">
                                      2. DUE DILIGENCE
                                    </span>
                                    <span>
                                      Risk:{" "}
                                      {
                                        memoJob.resultRefJson.diligenceResult
                                          ?.riskLevel
                                      }{" "}
                                      (Verified Leases:{" "}
                                      {
                                        memoJob.resultRefJson.diligenceResult
                                          ?.verifiedLeasesCount
                                      }
                                      )
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="border border-border-subtle rounded-md bg-bg-base p-4 max-h-96 overflow-y-auto">
                                <div className="text-[10px] font-mono text-text-muted uppercase font-bold border-b border-border-subtle pb-2 mb-3">
                                  Draft Memorandum Preview
                                </div>
                                <div className="text-xs font-sans text-text-primary leading-relaxed whitespace-pre-wrap">
                                  {memoJob.resultRefJson.memoResult.memoText}
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    handleApproveWorkflowMemo(memoJob.id)
                                  }
                                  className="bg-success text-text-inverse hover:bg-success/90 font-semibold py-1.5 px-4 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors duration-120 cursor-pointer"
                                >
                                  Approve & Publish Memo
                                </button>
                                <button
                                  onClick={() =>
                                    handleRejectWorkflowMemo(memoJob.id)
                                  }
                                  className="bg-danger text-text-inverse hover:bg-danger/90 font-semibold py-1.5 px-4 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors duration-120 cursor-pointer"
                                >
                                  Reject & Discard
                                </button>
                              </div>
                            </div>
                          )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {["queued", "running"].includes(memoJob.status) && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-text-secondary">
                                Drafting memo...
                              </span>
                              <span className="text-text-primary font-bold">
                                {memoJob.progressPct}%
                              </span>
                            </div>
                            <div className="w-full bg-bg-base border border-border-subtle h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-accent-intelligence h-full transition-all duration-300"
                                style={{ width: `${memoJob.progressPct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {memoJob.status === "awaiting_approval" &&
                          memoJob.resultRefJson?.memoText && (
                            <div className="space-y-4">
                              <div className="border border-border-subtle rounded-md bg-bg-base p-4 max-h-96 overflow-y-auto">
                                <div className="text-[10px] font-mono text-text-muted uppercase font-bold border-b border-border-subtle pb-2 mb-3">
                                  Draft Memorandum Preview (Review Checkpoint
                                  Required)
                                </div>
                                <div className="text-xs font-sans text-text-primary leading-relaxed whitespace-pre-wrap">
                                  {memoJob.resultRefJson.memoText}
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApproveMemo(memoJob.id)}
                                  className="bg-success text-text-inverse hover:bg-success/90 font-semibold py-1.5 px-4 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors duration-120 cursor-pointer"
                                >
                                  Approve & Finalize Memo
                                </button>
                                <button
                                  onClick={() => handleRejectMemo(memoJob.id)}
                                  className="bg-danger text-text-inverse hover:bg-danger/90 font-semibold py-1.5 px-4 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors duration-120 cursor-pointer"
                                >
                                  Reject & Discard
                                </button>
                              </div>
                            </div>
                          )}
                      </div>
                    )}

                    {memoJob.resultRefJson?.stepTrace && (
                      <div className="bg-bg-base border border-border-subtle p-3 rounded-md font-mono text-[10px] text-accent-intelligence space-y-1 max-h-40 overflow-y-auto">
                        <div className="text-text-muted uppercase text-[9px] border-b border-border-subtle pb-1 mb-1 font-bold">
                          Agent Execution Step Trace
                        </div>
                        {memoJob.resultRefJson.stepTrace.map(
                          (step: string, idx: number) => (
                            <div key={idx} className="flex gap-1.5 items-start">
                              <span className="text-text-muted select-none">
                                &gt;
                              </span>
                              <span>{step}</span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Runs History */}
                {jobsHistory.length > 0 && (
                  <div className="border-t border-border-subtle pt-4 space-y-3">
                    <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider font-bold">
                      Agent Run History Log
                    </h4>
                    <div className="space-y-2">
                      {jobsHistory.slice(0, 3).map((job: any) => (
                        <div
                          key={job.id}
                          className="flex justify-between items-center text-xs font-mono p-2 bg-bg-base/50 border border-border-subtle rounded-xs"
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-text-primary">
                              Job ID: {job.id.slice(0, 8)}... (
                              {job.jobType === "multi_agent_workflow"
                                ? "workflow"
                                : "memo"}
                              )
                            </span>
                            <span className="text-[9px] text-text-muted">
                              {new Date(job.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {job.errorMessage && (
                              <span
                                className="text-[9px] text-danger max-w-xs truncate"
                                title={job.errorMessage}
                              >
                                {job.errorMessage}
                              </span>
                            )}
                            <span
                              className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-sm ${
                                job.status === "completed"
                                  ? "bg-success/20 text-success"
                                  : job.status === "failed"
                                    ? "bg-danger/20 text-danger"
                                    : job.status === "blocked"
                                      ? "bg-danger/20 text-danger animate-pulse"
                                      : "bg-accent-intelligence/20 text-accent-intelligence"
                              }`}
                            >
                              {job.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-bg-surface border border-border-default rounded-md p-12 text-center text-text-muted text-xs font-mono">
              Adjust asset parameters and click RECOMPUTE to run underwriting
              analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
