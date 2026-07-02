"use client";

import React, { useState, useEffect } from "react";
import { useTerminal } from "../../../context/TerminalContext";
import { api } from "../../../lib/api";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import NoPortfolio from "../../../components/visuals/NoPortfolio";

export default function PortfolioPage() {
  const { activeWorkspace } = useTerminal();
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPortfolioData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    setError("");
    try {
      const ports = await api.getPortfolios(activeWorkspace.id);
      setPortfolios(ports);
    } catch (err) {
      console.error(err);
      setError("Failed to load portfolio data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolioData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-secondary font-mono text-xs">
        LOADING PORTFOLIO POSITION LEDGERS...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-danger/10 border border-danger/30 text-danger text-xs font-mono p-4 rounded-md">
          {error}
        </div>
      </div>
    );
  }

  const portfolio = portfolios[0];
  const positions = portfolio?.positions || [];

  if (positions.length === 0) {
    return (
      <div className="p-6 space-y-6 flex flex-col items-center justify-center min-h-[80vh]">
        <NoPortfolio className="h-24 w-24 mb-4 text-text-muted" />
        <h2 className="text-md font-bold text-text-primary uppercase tracking-wider mb-2">
          Portfolio OS is Empty
        </h2>
        <p className="text-xs text-text-secondary max-w-md text-center mb-6">
          No holdings or financing accounts have been logged in this workspace.
          Analyze a deal in the Deal Finder to add positions here.
        </p>
      </div>
    );
  }

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

  const portfolioBaseCurrency = portfolio?.baseCurrency || "AED";

  const totalValue = positions.reduce((acc: number, pos: any) => {
    const converted = convertCurrency(
      Number(pos.acquisitionPrice),
      pos.acquisitionCurrency || "AED",
      portfolioBaseCurrency,
    );
    return acc + converted;
  }, 0);

  const totalDebt = positions.reduce((acc: number, pos: any) => {
    const facility = pos.financingFacilities?.[0];
    if (!facility) return acc;
    const converted = convertCurrency(
      Number(facility.principalAmount),
      facility.currency || "AED",
      portfolioBaseCurrency,
    );
    return acc + converted;
  }, 0);

  const netEquity = totalValue - totalDebt;

  let totalCashFlow = 0;
  let hasCashFlows = false;
  positions.forEach((pos: any) => {
    if (pos.cashFlowEntries && pos.cashFlowEntries.length > 0) {
      hasCashFlows = true;
      totalCashFlow += pos.cashFlowEntries.reduce((sum: number, entry: any) => {
        const converted = convertCurrency(
          Number(entry.amount),
          entry.currency || pos.acquisitionCurrency || "AED",
          portfolioBaseCurrency,
        );
        return sum + converted;
      }, 0);
    }
  });
  const averageYield =
    hasCashFlows && totalValue > 0 ? (totalCashFlow / totalValue) * 100 : null;

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border-default pb-4">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">
          PORTFOLIO OS
        </h1>
        <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mt-1">
          Operational holdings, leverage ratios, and cash flow ledgers
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-surface border border-border-default p-4 rounded-md">
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
            Portfolio Value
          </span>
          <span className="text-lg font-bold text-text-primary font-mono block mt-1">
            {totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
            {portfolioBaseCurrency}
          </span>
        </div>
        <div className="bg-bg-surface border border-border-default p-4 rounded-md">
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
            Leverage Debt
          </span>
          <span className="text-lg font-bold text-text-primary font-mono block mt-1">
            {totalDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
            {portfolioBaseCurrency}
          </span>
        </div>
        <div className="bg-bg-surface border border-border-default p-4 rounded-md">
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
            Net Equity Value
          </span>
          <span className="text-lg font-bold text-accent-intelligence font-mono block mt-1">
            {netEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
            {portfolioBaseCurrency}
          </span>
        </div>
        <div className="bg-bg-surface border border-border-default p-4 rounded-md">
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider block">
            Blended Net Yield
          </span>
          <span className="text-lg font-bold text-success font-mono block mt-1">
            {averageYield !== null ? `${averageYield.toFixed(2)}%` : "N/A"}
          </span>
        </div>
      </div>

      <div className="bg-bg-surface border border-border-default rounded-md p-5">
        <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4">
          Positions Ledger
        </h2>

        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-xs font-mono"
            aria-label="Portfolio positions ledger"
          >
            <thead>
              <tr className="border-b border-border-subtle text-text-muted text-[10px] uppercase">
                <th className="py-2 px-3">Asset</th>
                <th className="py-2 px-3">District</th>
                <th className="py-2 px-3 text-right">Acquisition Cost</th>
                <th className="py-2 px-3 text-right">Mortgage LTV</th>
                <th className="py-2 px-3 text-right">Net Yield</th>
                <th className="py-2 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos: any) => {
                const facility = pos.financingFacilities?.[0];
                const ltv = facility
                  ? (
                      (Number(facility.principalAmount) /
                        Number(pos.acquisitionPrice)) *
                      100
                    ).toFixed(1)
                  : "0.0";

                const posCashFlow =
                  pos.cashFlowEntries?.reduce(
                    (sum: number, entry: any) => sum + Number(entry.amount),
                    0,
                  ) || 0;
                const hasPosCashFlows =
                  pos.cashFlowEntries && pos.cashFlowEntries.length > 0;
                const posYield =
                  hasPosCashFlows && Number(pos.acquisitionPrice) > 0
                    ? (posCashFlow / Number(pos.acquisitionPrice)) * 100
                    : null;

                return (
                  <tr
                    key={pos.id}
                    className="border-b border-border-subtle hover:bg-hover transition-colors"
                  >
                    <td className="py-3 px-3 text-text-primary font-sans font-semibold">
                      {pos.property?.building?.name || "Unknown Asset"}
                    </td>
                    <td className="py-3 px-3 text-text-secondary">
                      {pos.property?.building?.districtName ||
                        "Unknown District"}
                    </td>
                    <td className="py-3 px-3 text-right text-text-primary font-bold">
                      {Number(pos.acquisitionPrice).toLocaleString()}{" "}
                      {pos.acquisitionCurrency}
                    </td>
                    <td className="py-3 px-3 text-right text-text-primary">
                      {ltv}%
                    </td>
                    <td className="py-3 px-3 text-right text-success font-bold font-mono">
                      {posYield !== null ? `${posYield.toFixed(2)}%` : "N/A"}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="bg-success/10 text-success border border-success/30 px-1.5 py-0.5 rounded-xs text-[9px] uppercase">
                        {pos.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-bg-surface border border-border-default rounded-md p-5">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-accent-intelligence" />
            <span>Cash Flow Register (Last 30 Days)</span>
          </h2>
          <div className="space-y-3 font-mono text-xs">
            {positions
              .flatMap((pos: any) => pos.cashFlowEntries || [])
              .map((cf: any) => {
                const isPositive = cf.amount > 0;
                return (
                  <div
                    key={cf.id}
                    className="p-3 bg-bg-base border border-border-subtle rounded-sm flex justify-between items-center"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-text-primary font-sans">
                        {cf.description}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {new Date(cf.entryDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold">
                      {isPositive ? (
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-danger" />
                      )}
                      <span
                        className={isPositive ? "text-success" : "text-danger"}
                      >
                        {isPositive ? "+" : ""}
                        {cf.amount.toLocaleString()} {cf.currency}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2">
            Action Recommendations
          </h2>

          <div className="text-center py-6 text-text-muted text-xs font-mono">
            Action Recommendations are currently unavailable.
          </div>
        </div>
      </div>
    </div>
  );
}
