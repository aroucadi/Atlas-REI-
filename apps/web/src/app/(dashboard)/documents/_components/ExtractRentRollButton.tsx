'use client';

import { useState } from 'react';
import { Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ExtractRentRollResponse {
  id: string;
  fieldsJson: {
    units: Array<{ unitNumber: { value: string | null } }>;
    summary: {
      occupiedUnitCount: { value: number | null };
      vacantUnitCount: { value: number | null };
    };
    missingItems: string[];
  };
  confidenceJson: {
    documentAggregateConfidence: number;
    lowConfidenceUnits: (string | null)[];
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
  | { status: 'success'; result: ExtractRentRollResponse }
  | { status: 'error'; message: string };

interface ExtractRentRollButtonProps {
  workspaceId: string;
  document: DocumentSummary;
  onComplete?: () => void;
}

async function triggerRentRollExtraction(
  workspaceId: string,
  documentId: string,
): Promise<ExtractRentRollResponse> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/documents/${documentId}/extract-rent-roll`,
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

export function ExtractRentRollButton({
  workspaceId,
  document,
  onComplete,
}: ExtractRentRollButtonProps) {
  const [state, setState] = useState<ExtractionState>({ status: 'idle' });

  if (document.documentType !== 'rent_roll') {
    return null;
  }

  const handleExtract = async () => {
    setState({ status: 'loading' });
    try {
      const result = await triggerRentRollExtraction(workspaceId, document.id);
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
            Extracting rent roll…
          </>
        ) : (
          <>
            <FileSpreadsheet className="h-4 w-4" />
            Extract Rent Roll
          </>
        )}
      </button>

      {state.status === 'success' && (
        <ExtractionSummary result={state.result} />
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}
    </div>
  );
}

function ExtractionSummary({ result }: { result: ExtractRentRollResponse }) {
  const { fieldsJson, confidenceJson } = result;
  const totalUnits = fieldsJson.units?.length || 0;
  const occupied = fieldsJson.summary?.occupiedUnitCount?.value;
  const vacant = fieldsJson.summary?.vacantUnitCount?.value;
  const lowConfidenceCount = (confidenceJson.lowConfidenceUnits || []).filter(Boolean).length;
  const confidencePct = Math.round((confidenceJson.documentAggregateConfidence || 0) * 100);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <div className="flex items-center gap-2 font-medium text-slate-900">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Extracted {totalUnits} unit{totalUnits === 1 ? '' : 's'}
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
        <div>
          <dt className="inline text-slate-400">Occupied: </dt>
          <dd className="inline font-medium">{occupied ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Vacant: </dt>
          <dd className="inline font-medium">{vacant ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Confidence: </dt>
          <dd className="inline font-medium">{confidencePct}%</dd>
        </div>
        <div>
          <dt className="inline text-slate-400">Needs review: </dt>
          <dd className="inline font-medium">
            {lowConfidenceCount > 0 ? `${lowConfidenceCount} unit(s)` : 'None'}
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
