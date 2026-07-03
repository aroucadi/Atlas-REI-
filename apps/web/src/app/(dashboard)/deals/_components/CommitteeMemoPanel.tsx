// apps/web/src/app/(dashboard)/deals/_components/CommitteeMemoPanel.tsx
//
// Renders the generated IC memo as a tab/panel on the deal/property page.
// Structure mirrors the memo schema sections directly — no creative
// reformatting — since partners reading this expect a standard memo
// structure, not a novel UI layout. Includes the draft notification and
// human sign-off status flow.

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  FileWarning,
  UserCheck,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Types (mirror packages/ai-gateway/schemas/committeeMemo.schema.ts)
// -----------------------------------------------------------------------------

interface SupportedClaim {
  text: string;
  basedOn: string[];
}

interface MandateComplianceCheck {
  mandateLabel: string;
  mandateThreshold: number | string;
  dealValue: number | string | null;
  status: 'pass' | 'fail' | 'insufficient_data';
  explanation: string;
}

interface CommitteeMemo {
  executiveSummary: string;
  dealThesis: SupportedClaim[];
  risksAndObjections: SupportedClaim[];
  changeConditions: Array<{ condition: string; rationale: string }>;
  t12DiscrepancyHighlights: Array<{ description: string; severity: 'informational' | 'moderate' | 'material' }>;
  mandateComplianceChecks: MandateComplianceCheck[];
  overallRecommendation: 'proceed' | 'proceed_with_conditions' | 'do_not_proceed' | 'insufficient_data';
  dataGaps: string[];
}

interface ComplianceMismatch {
  mandateLabel: string;
  modelStatus: string;
  recomputedStatus: string;
}

interface CommitteeMemoRecord {
  id: string;
  contentJson: CommitteeMemo;
  complianceMismatchesJson: ComplianceMismatch[];
  status: string; // 'draft' | 'signed_off'
  createdAt: string;
  signedOffAt?: string | null;
}

interface CommitteeMemoPanelProps {
  workspaceId: string;
  propertyId: string;
}

// -----------------------------------------------------------------------------
// Data fetching
// -----------------------------------------------------------------------------

function useCommitteeMemo(workspaceId: string, propertyId: string) {
  const [memo, setMemo] = useState<CommitteeMemoRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOff, setSigningOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemo = useCallback(
    async (regenerate = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/properties/${propertyId}/committee-memo${regenerate ? '?regenerate=true' : ''}`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? `Failed to load memo (${res.status})`);
        }
        setMemo(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load committee memo');
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, propertyId],
  );

  const signOff = useCallback(async () => {
    setSigningOff(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/properties/${propertyId}/committee-memo/sign-off`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to sign off memo (${res.status})`);
      }
      setMemo(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign off committee memo');
    } finally {
      setSigningOff(false);
    }
  }, [workspaceId, propertyId]);

  useEffect(() => {
    fetchMemo();
  }, [fetchMemo]);

  return { memo, loading, error, signingOff, regenerate: () => fetchMemo(true), signOff };
}

// -----------------------------------------------------------------------------
// Panel
// -----------------------------------------------------------------------------

const RECOMMENDATION_STYLES: Record<CommitteeMemo['overallRecommendation'], { label: string; className: string }> = {
  proceed: { label: 'Proceed', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  proceed_with_conditions: { label: 'Proceed with Conditions', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  do_not_proceed: { label: 'Do Not Proceed', className: 'bg-red-100 text-red-800 border-red-300' },
  insufficient_data: { label: 'Insufficient Data', className: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const SEVERITY_STYLES: Record<'informational' | 'moderate' | 'material', string> = {
  informational: 'bg-slate-100 text-slate-600',
  moderate: 'bg-amber-100 text-amber-700',
  material: 'bg-red-100 text-red-700',
};

export function CommitteeMemoPanel({ workspaceId, propertyId }: CommitteeMemoPanelProps) {
  const { memo, loading, error, signingOff, regenerate, signOff } = useCommitteeMemo(workspaceId, propertyId);

  if (loading && !memo) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500 font-mono">
        <Loader2 className="h-4 w-4 animate-spin" />
        Generating committee memo…
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 rounded-sm border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger font-mono">
        {error}
      </div>
    );
  }

  if (!memo) return null;

  const content = memo.contentJson;
  const recommendation = RECOMMENDATION_STYLES[content.overallRecommendation];
  const isSignedOff = memo.status === 'signed_off';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* --- Draft Notice Banner --- */}
      {!isSignedOff ? (
        <div className="flex items-center justify-between gap-3 rounded-sm border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-500">
          <div className="flex gap-2 items-center">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-mono text-xs uppercase tracking-wider font-semibold">
              AI-Drafted Memo — Review Required
            </span>
          </div>
          <button
            onClick={signOff}
            disabled={signingOff}
            className="flex items-center gap-1.5 rounded-sm bg-amber-500 px-3 py-1 text-xs font-mono font-medium text-slate-900 hover:bg-amber-400 disabled:opacity-50"
          >
            {signingOff ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            Approve &amp; Sign Off
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-sm border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-500 font-mono text-xs uppercase tracking-wider font-semibold">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>✓ AI-Drafted, Human-Reviewed &amp; Signed Off</span>
          {memo.signedOffAt && (
            <span className="text-slate-400 normal-case font-normal ml-auto">
              Approved {new Date(memo.signedOffAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* --- Header --- */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Investment Committee Memo</h2>
          <p className="text-xs text-slate-400 font-mono">
            Generated {new Date(memo.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-sm border px-3 py-1 text-xs font-mono font-semibold ${recommendation.className}`}>
            {recommendation.label}
          </span>
          <button
            onClick={regenerate}
            disabled={loading || isSignedOff}
            className="flex items-center gap-1 rounded-sm border border-slate-700 px-2.5 py-1 text-xs font-mono font-medium text-slate-400 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
        </div>
      </div>

      {/* --- Data gaps banner, if any --- */}
      {content.dataGaps.length > 0 && (
        <div className="flex items-start gap-2 rounded-sm border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-500">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold font-mono text-xs uppercase">This memo was drafted with incomplete data:</p>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-300">
              {content.dataGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* --- Model/recompute mismatch banner --- */}
      {memo.complianceMismatchesJson.length > 0 && (
        <div className="flex items-start gap-2 rounded-sm border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold font-mono text-xs uppercase">
              Automated recheck found a possible error in the mandate compliance table below:
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-300">
              {memo.complianceMismatchesJson.map((m) => (
                <li key={m.mandateLabel}>
                  {m.mandateLabel}: memo says "{m.modelStatus}", recomputed as "{m.recomputedStatus}" — verify manually before relying on this section.
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* --- Executive summary --- */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
          Executive Summary
        </h3>
        <p className="text-sm leading-relaxed text-slate-300 bg-slate-900/50 p-4 border border-slate-800 rounded-sm">
          {content.executiveSummary}
        </p>
      </section>

      {/* --- Deal thesis --- */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
          Deal Thesis
        </h3>
        <ul className="space-y-2">
          {content.dealThesis.map((claim, i) => (
            <ClaimRow key={i} claim={claim} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />} />
          ))}
        </ul>
      </section>

      {/* --- Risks & objections --- */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
          Risks &amp; Objections
        </h3>
        <ul className="space-y-2">
          {content.risksAndObjections.map((claim, i) => (
            <ClaimRow key={i} claim={claim} icon={<AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />} />
          ))}
        </ul>
      </section>

      {/* --- T-12 discrepancies --- */}
      {content.t12DiscrepancyHighlights.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
            T-12 Discrepancy Highlights
          </h3>
          <ul className="space-y-1.5">
            {content.t12DiscrepancyHighlights.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className={`mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase ${SEVERITY_STYLES[d.severity]}`}>
                  {d.severity}
                </span>
                <span>{d.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Mandate compliance table --- */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
          Mandate Compliance
        </h3>
        <div className="overflow-x-auto border border-slate-800 rounded-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs uppercase text-slate-400 font-mono">
                <th className="p-3 font-medium">Mandate</th>
                <th className="p-3 font-medium">Threshold</th>
                <th className="p-3 font-medium">Deal Value</th>
                <th className="p-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {content.mandateComplianceChecks.map((check) => (
                <tr key={check.mandateLabel} className="border-b border-slate-800/60 hover:bg-slate-900/10">
                  <td className="p-3 text-slate-200 font-medium">{check.mandateLabel}</td>
                  <td className="p-3 text-slate-400 font-mono">{check.mandateThreshold}</td>
                  <td className="p-3 text-slate-400 font-mono">{check.dealValue ?? '—'}</td>
                  <td className="p-3 flex justify-end">
                    <MandateStatusBadge status={check.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 space-y-1.5 bg-slate-900/20 p-3 rounded-sm border border-slate-800/40">
          {content.mandateComplianceChecks.map((check) => (
            <p key={check.mandateLabel} className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300 font-mono">{check.mandateLabel}:</span> {check.explanation}
            </p>
          ))}
        </div>
      </section>

      {/* --- Change conditions --- */}
      {content.changeConditions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
            Conditions for Revisiting Recommendation
          </h3>
          <ul className="space-y-2">
            {content.changeConditions.map((c, i) => (
              <li key={i} className="text-sm text-slate-300 bg-slate-900/20 p-3 border border-slate-800/60 rounded-sm">
                <span className="font-semibold text-amber-500 font-mono">{c.condition}</span>
                <span className="text-slate-400"> — {c.rationale}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ClaimRow({ claim, icon }: { claim: SupportedClaim; icon: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-300 bg-slate-900/30 p-3 border border-slate-800/60 rounded-sm">
      {icon}
      <div>
        <span>{claim.text}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {claim.basedOn.map((src) => (
            <span key={src} className="rounded-sm bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 uppercase tracking-wide">
              {formatSourceLabel(src)}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}

function MandateStatusBadge({ status }: { status: MandateComplianceCheck['status'] }) {
  if (status === 'pass') {
    return (
      <span className="flex w-fit items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-medium text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3.5 w-3.5" /> Pass
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span className="flex w-fit items-center gap-1 rounded bg-danger/10 px-2 py-0.5 text-xs font-mono font-medium text-danger border border-danger/20">
        <XCircle className="h-3.5 w-3.5" /> Fail
      </span>
    );
  }
  return (
    <span className="flex w-fit items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-xs font-mono font-medium text-slate-400 border border-slate-700">
      <AlertTriangle className="h-3.5 w-3.5" /> Insufficient Data
    </span>
  );
}

function formatSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    property_details: 'Property',
    rent_roll_extraction: 'Rent Roll',
    t12_extraction: 'T-12',
    investor_mandate: 'Mandate',
  };
  return labels[source] ?? source;
}
