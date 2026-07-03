'use client';

import { useState } from 'react';
import { Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ExtractT12Response {
  id: string;
  fieldsJson: {
    reportedTotals: {
      netOperatingIncome: { value: number | null };
      totalGrossRevenue: { value: number | null };
      totalOperatingExpenses: { value: number | null };
    };
    missingItems: string[];
  };
  confidenceJson: {
    documentAggregateConfidence: number;
    reconciliation?: {
      status: 'reconciled' | 'discrepancy' | 'not_reported';
      reportedNOI: number | null;
      computedNOI: number;
      deltaPct: number | null;
    };
  };
}

interface DocumentSummary {
  id: string;
  documentType: string;
  fileName: string;
}

type ExtractionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: ExtractT12Response }
  | { status: 'error'; message: string };

interface ExtractT12ButtonProps {
  workspaceId: string;
  document: DocumentSummary;
  onComplete?: () => void;
}

async function triggerT12Extraction(
  workspaceId: string,
  documentId: string,
): Promise<ExtractT12Response> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/documents/${documentId}/extract-t12`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.message ?? `Extraction failed with status ${res.status}`,
    );
  }

  return res.json();
}

export function ExtractT12Button({
  workspaceId,
  document,
  onComplete,
}: ExtractT12ButtonProps) {
  const [state, setState] = useState<ExtractionState>({ status: 'idle' });

  if (document.documentType !== 'operating_statement') {
    return null;
  }

  const handleExtract = async () => {
    setState({ status: 'loading' });
    try {
      const result = await triggerT12Extraction(workspaceId, document.id);
      setState({ status: 'success', result });
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Extraction failed',
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleExtract}
        disabled={state.status === 'loading'}
        className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5
                   text-sm font-medium text-white transition-colors
                   hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.status === 'loading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Extracting T-12 statement…
          </>
        ) : (
          <>
            <FileSpreadsheet className="h-4 w-4" />
            Extract T-12 Operating Statement
          </>
        )}
      </button>

      {state.status === 'success' && (
        <ExtractionSummary result={state.result} />
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-mono">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}
    </div>
  );
}

function ExtractionSummary({ result }: { result: ExtractT12Response }) {
  const { fieldsJson, confidenceJson } = result;
  const reportedNOI = fieldsJson.reportedTotals?.netOperatingIncome?.value;
  const computedNOI = confidenceJson.reconciliation?.computedNOI;
  const reconciliationStatus = confidenceJson.reconciliation?.status;
  const deltaPct = confidenceJson.reconciliation?.deltaPct;
  const confidencePct = Math.round((confidenceJson.documentAggregateConfidence || 0) * 100);

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <div className="flex items-center gap-2 font-medium text-slate-900">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Extracted T-12 Operating Statement
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 font-mono">
        <div>
          <dt className="inline text-slate-400">Reported NOI: </dt>
          <dd className="inline font-medium">{formatCurrency(reportedNOI)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Computed NOI: </dt>
          <dd className="inline font-medium">{formatCurrency(computedNOI)}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Confidence: </dt>
          <dd className="inline font-medium">{confidencePct}%</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Reconciliation: </dt>
          <dd className={`inline font-semibold ${reconciliationStatus === 'discrepancy' ? 'text-amber-600' : 'text-emerald-600'}`}>
            {reconciliationStatus === 'discrepancy' ? `Discrepancy (${deltaPct ? (deltaPct * 100).toFixed(1) : 0}%)` : reconciliationStatus === 'reconciled' ? 'Reconciled' : 'Not Reported'}
          </dd>
        </div>
      </dl>
      {fieldsJson.missingItems && fieldsJson.missingItems.length > 0 && (
        <p className="mt-1.5 text-xs text-amber-700">
          Missing: {fieldsJson.missingItems.join(', ')}
        </p>
      )}
    </div>
  );
}
