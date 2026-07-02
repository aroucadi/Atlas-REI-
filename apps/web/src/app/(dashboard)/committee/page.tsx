"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTerminal } from "../../../context/TerminalContext";
import { api } from "../../../lib/api";
import { ShieldAlert, HelpCircle, FileText, User, Bot, RefreshCw } from "lucide-react";

function ClaimRow({
  claim,
  evidenceList,
}: {
  claim: any;
  evidenceList: any[];
}) {
  const [showPopover, setShowPopover] = useState(false);
  const matchedEvidence = claim.evidenceId
    ? evidenceList.find((e) => e.id === claim.evidenceId)
    : null;

  return (
    <div
      className={`p-3 rounded-sm border text-xs font-mono flex flex-col gap-2 ${
        claim.isSupported
          ? "bg-bg-base/50 border-border-subtle"
          : "bg-danger/5 border-danger/20 text-danger"
      }`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex gap-2 items-start">
          <span
            className={`px-1.5 py-0.5 rounded-xs text-[9px] font-bold uppercase shrink-0 ${
              claim.isSupported
                ? "bg-success/15 text-success border border-success/30"
                : "bg-danger/15 text-danger border border-danger/30"
            }`}
          >
            {claim.isSupported ? "Supported" : "Unsupported"}
          </span>
          <span
            className={
              claim.isSupported
                ? "text-text-primary"
                : "text-danger/90 font-sans"
            }
          >
            {claim.statement}
          </span>
        </div>

        {claim.isSupported && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowPopover(!showPopover)}
              className="text-[10px] text-accent-intelligence hover:underline flex items-center gap-1 cursor-pointer font-sans"
            >
              Citation 🔗
            </button>
            {showPopover && (
              <div className="absolute right-0 mt-1 w-64 bg-bg-surface-elevated border border-border-default rounded-md shadow-lg p-3 z-50 text-text-primary text-[10px] leading-relaxed font-sans space-y-1.5">
                <div className="font-bold border-b border-border-subtle pb-1 uppercase tracking-wider text-text-muted">
                  Evidence Details
                </div>
                {matchedEvidence ? (
                  <>
                    <div>
                      <strong>Title:</strong> {matchedEvidence.title}
                    </div>
                    <div>
                      <strong>Source:</strong> {matchedEvidence.sourceType} (
                      {matchedEvidence.sourceId.slice(0, 8)})
                    </div>
                    <div>
                      <strong>Freshness:</strong>{" "}
                      {new Date(matchedEvidence.freshness).toLocaleDateString()}
                    </div>
                    <div>
                      <strong>Confidence:</strong>{" "}
                      {(Number(matchedEvidence.confidence) * 100).toFixed(0)}%
                    </div>
                    {matchedEvidence.snippet && (
                      <div className="italic text-text-secondary mt-1 p-1 bg-bg-base rounded-sm">
                        "{matchedEvidence.snippet}"
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <strong>Source:</strong> {claim.source || "Unknown"}
                    </div>
                    {claim.freshness && (
                      <div>
                        <strong>Freshness:</strong>{" "}
                        {new Date(claim.freshness).toLocaleDateString()}
                      </div>
                    )}
                    {claim.confidence !== null &&
                      claim.confidence !== undefined && (
                        <div>
                          <strong>Confidence:</strong>{" "}
                          {(claim.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                    <div className="text-text-muted mt-1 italic">
                      Source document was parsed successfully.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommitteeContent() {
  const { activeWorkspace, activeProfile } = useTerminal();
  const searchParams = useSearchParams();
  const runId =
    searchParams.get("underwriteRunId") || searchParams.get("runId");

  const [decision, setDecision] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Agent messages state
  const [agentMessages, setAgentMessages] = useState<any[]>([]);
  const [negotiating, setNegotiating] = useState(false);

  const loadDecision = async () => {
    if (!activeWorkspace) return;
    if (!runId) {
      setError(
        'No active evaluation run ID specified. Please select a property and execute "Evaluate Deal".',
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await api.getCommitteeRun(activeWorkspace.id, runId);
      setDecision(res);

      try {
        const evs = await api.getEvidence(activeWorkspace.id, res.entityId);
        setEvidence(evs);
      } catch (e) {
        console.error("Failed to load evidence ledger for decision", e);
      }

      // Load agent message transcripts for consensus negotiation
      try {
        const msgs = await api.getAgentMessages(activeWorkspace.id, runId);
        setAgentMessages(msgs);
      } catch (e) {
        console.error("Failed to load agent messages", e);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to retrieve committee evaluation run");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDecision();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, activeProfile, runId]);

  const handleRunNegotiation = async () => {
    if (!activeWorkspace || !runId || !decision) return;
    setNegotiating(true);
    try {
      await api.runNegotiation(activeWorkspace.id, {
        goalId: runId,
        propertyId: decision.entityId,
        initialYield: 9.2, // standard starting yield for comps challenge
      });
      const msgs = await api.getAgentMessages(activeWorkspace.id, runId);
      setAgentMessages(msgs);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to execute agent negotiation");
    } finally {
      setNegotiating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-secondary font-mono text-xs">
        GENERATING AI MEMO VERDICT...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div className="border-b border-border-default pb-4">
          <h1 className="text-lg font-bold text-text-primary tracking-tight">
            AI INVESTMENT COMMITTEE
          </h1>
          <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mt-1">
            Objection mapping and decision explainability memo
          </p>
        </div>
        <div className="max-w-md bg-bg-surface border border-danger/30 rounded-md p-6 space-y-4">
          <div className="flex items-center gap-2 text-danger">
            <ShieldAlert className="h-5 w-5" />
            <h2 className="text-xs font-bold uppercase tracking-widest">
              Evaluation Load Error
            </h2>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed font-mono">
            {error}
          </p>
          {runId && (
            <button
              onClick={loadDecision}
              className="px-3 py-1.5 bg-bg-base hover:bg-border-subtle border border-border-default rounded text-[10px] font-mono uppercase text-text-primary transition-colors"
            >
              Retry Connection
            </button>
          )}
        </div>
      </div>
    );
  }

  const isBuy =
    decision?.verdict === "Buy" || decision?.verdict === "Strong Buy";
  const isAvoid = decision?.verdict === "Avoid";

  let bannerClass = "bg-warning/10 border-warning text-warning";
  if (isBuy) bannerClass = "bg-success/10 border-success text-success";
  if (isAvoid) bannerClass = "bg-danger/10 border-danger text-danger";

  // Check if there are any unsupported claims across thesis, objections, change conditions
  const hasUnsupportedClaims =
    [
      ...(decision?.thesisClaims || []),
      ...(decision?.objectionsClaims || []),
      ...(decision?.changeConditionsClaims || []),
    ].some((c) => !c.isSupported) && !isAvoid;

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border-default pb-4">
        <h1 className="text-lg font-bold text-text-primary tracking-tight">
          AI INVESTMENT COMMITTEE
        </h1>
        <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest mt-1">
          Objection mapping and decision explainability memo
        </p>
      </div>

      {decision ? (
        <div className="space-y-6 max-w-4xl">
          {hasUnsupportedClaims && (
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-md text-xs font-sans text-warning flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
              <div>
                <strong className="block uppercase text-[10px] font-mono tracking-wider">
                  Caution: Unsupported Claims Detected
                </strong>
                <span className="block mt-1 text-text-secondary">
                  The AI generated thesis contains speculative assertions that
                  are not backed by verified documents or underwriting comps in
                  the evidence ledger. Review these points carefully before
                  capital allocation.
                </span>
              </div>
            </div>
          )}

          <div
            className={`border rounded-md p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${bannerClass}`}
          >
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-text-muted">
                Committee Verdict
              </div>
              <div className="text-xl font-bold mt-1 uppercase">
                {decision.verdict}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
                Thesis Confidence
              </div>
              <div className="text-md font-bold text-text-primary font-mono mt-1">
                {decision.confidenceScore !== null
                  ? `${(Number(decision.confidenceScore) * 100).toFixed(0)}%`
                  : "N/A"}
              </div>
            </div>
          </div>

          <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2">
              Core Investment Thesis
            </h2>
            <p className="text-xs leading-relaxed text-text-secondary font-sans italic border-l-2 border-accent-intelligence/40 pl-3">
              {decision.thesisSummary}
            </p>
            <div className="space-y-2 mt-4">
              <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                Grounded Thesis Claims
              </h4>
              {decision.thesisClaims && decision.thesisClaims.length > 0 ? (
                decision.thesisClaims.map((claim: any, idx: number) => (
                  <ClaimRow key={idx} claim={claim} evidenceList={evidence} />
                ))
              ) : (
                <div className="text-xs text-text-muted font-mono py-1">
                  No thesis claims generated.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-danger" />
                <span>Structural Objections</span>
              </h2>
              <pre className="text-xs leading-relaxed text-text-secondary font-sans whitespace-pre-wrap italic border-l-2 border-danger/40 pl-3">
                {decision.objectionsSummary}
              </pre>
              <div className="space-y-2 mt-4">
                <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Grounded Objections Claims
                </h4>
                {decision.objectionsClaims &&
                decision.objectionsClaims.length > 0 ? (
                  decision.objectionsClaims.map((claim: any, idx: number) => (
                    <ClaimRow key={idx} claim={claim} evidenceList={evidence} />
                  ))
                ) : (
                  <div className="text-xs text-text-muted font-mono py-1">
                    No objections claims generated.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-warning" />
                <span>Thesis Breakpoints</span>
              </h2>
              <pre className="text-xs leading-relaxed text-text-secondary font-sans whitespace-pre-wrap italic border-l-2 border-warning/40 pl-3">
                {decision.changeConditionsSummary}
              </pre>
              <div className="space-y-2 mt-4">
                <h4 className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Grounded Breakpoint Claims
                </h4>
                {decision.changeConditionsClaims &&
                decision.changeConditionsClaims.length > 0 ? (
                  decision.changeConditionsClaims.map(
                    (claim: any, idx: number) => (
                      <ClaimRow
                        key={idx}
                        claim={claim}
                        evidenceList={evidence}
                      />
                    ),
                  )
                ) : (
                  <div className="text-xs text-text-muted font-mono py-1">
                    No breakpoint claims generated.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Underwriter vs Critic Agent Society Live Bubble Feed */}
          <div className="bg-bg-surface border border-border-default rounded-md p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-border-subtle pb-2">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent-intelligence" />
                <span>Agent Society Consensus Negotiation bubble feed</span>
              </h2>
              <button
                onClick={handleRunNegotiation}
                disabled={negotiating}
                className="flex items-center gap-1.5 px-3 py-1 bg-accent-intelligence hover:bg-accent-intelligence/90 text-text-inverse font-mono rounded-sm text-[9px] cursor-pointer"
              >
                {negotiating ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  "TRIGGER AGENT COMP NEGOTIATION"
                )}
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto p-4 bg-bg-base/40 border border-border-subtle rounded-sm">
              {agentMessages && agentMessages.length > 0 ? (
                agentMessages.map((msg: any, idx: number) => {
                  const isUnderwriter = msg.sender === "UnderwriterAgent";
                  return (
                    <div
                      key={idx}
                      className={`flex gap-3 max-w-[85%] ${
                        isUnderwriter ? "mr-auto" : "ml-auto flex-row-reverse"
                      }`}
                    >
                      <div className="shrink-0 p-1.5 rounded-full bg-bg-surface-elevated border border-border-subtle text-text-secondary h-8 w-8 flex items-center justify-center">
                        {isUnderwriter ? <Bot className="h-4 w-4 text-success" /> : <User className="h-4 w-4 text-warning" />}
                      </div>
                      <div
                        className={`p-3 rounded-md text-xs leading-relaxed space-y-1.5 ${
                          isUnderwriter
                            ? "bg-success/10 border border-success/20 text-text-primary"
                            : "bg-warning/10 border border-warning/20 text-text-primary"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[8px] font-mono text-text-muted">
                          <span className="font-bold uppercase">{msg.sender}</span>
                          <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="font-sans">
                          {msg.payloadJson?.feedback || msg.payloadJson?.message || `Proposing underwriting model with Yield: ${msg.payloadJson?.yield}%`}
                        </p>
                        {msg.payloadJson?.rationale && (
                          <p className="text-[10px] italic text-text-secondary border-t border-border-subtle/30 pt-1">
                            Rationale: {msg.payloadJson.rationale}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-text-muted text-[10px] font-mono uppercase">
                  No active negotiations generated. Click the button above to challenge comps yields.
                </div>
              )}
            </div>
          </div>

          <div className="bg-bg-surface border border-border-default rounded-md p-5">
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-widest border-b border-border-subtle pb-2 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent-intelligence" />
              <span>Evidence Ledger & Citations</span>
            </h2>

            <div className="space-y-3">
              {evidence && evidence.length > 0 ? (
                evidence.map((ev: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-bg-base border border-border-subtle rounded-sm flex justify-between items-center text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-success"></span>
                      <span className="font-bold text-text-primary uppercase font-mono">
                        {ev.sourceType}
                      </span>
                      <span className="text-text-muted">— {ev.title}</span>
                    </div>
                    <span className="text-text-muted text-[10px] font-mono uppercase">
                      Confidence: {(Number(ev.confidence) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-bg-base border border-border-subtle rounded-sm text-xs text-text-muted font-mono">
                  No evidence available. Missing inputs: verified listing
                  history registry, structural building service records, and
                  property registry title deeds.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-text-muted text-xs font-mono">
          No evaluation records found.
        </div>
      )}
    </div>
  );
}

export default function CommitteePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-base flex items-center justify-center text-text-secondary font-mono text-xs">
          LOADING COMMITTEE ENGINE...
        </div>
      }
    >
      <CommitteeContent />
    </Suspense>
  );
}
