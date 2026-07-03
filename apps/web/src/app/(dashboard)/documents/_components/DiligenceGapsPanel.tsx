'use client';

import { AlertTriangle, XCircle, AlertCircle } from 'lucide-react';

interface FailedExtraction {
  status: 'failed';
  failureDetailJson: {
    reason: 'insufficient_ocr_text' | 'ai_gateway_error' | 'schema_validation_failed' | 'zero_units_extracted' | 'zero_data_extracted';
    [key: string]: unknown;
  };
}

interface CompletedExtraction {
  status: 'completed';
  missingItemsJson: string[];
  confidenceJson: {
    documentAggregateConfidence: number;
    lowConfidenceUnits?: (string | null)[];
    reconciliation?: {
      status: 'reconciled' | 'discrepancy' | 'not_reported';
      reportedNOI: number | null;
      computedNOI: number;
      deltaPct: number | null;
    };
  };
}

type ExtractionRecord = FailedExtraction | CompletedExtraction;

interface DiligenceGapsPanelProps {
  extraction: ExtractionRecord | null;
  onRetry?: () => void;
}

const FAILURE_MESSAGES: Record<FailedExtraction['failureDetailJson']['reason'], string> = {
  insufficient_ocr_text:
    'This document could not be read — the scan quality may be too low, or the wrong file may have been uploaded. Try re-uploading a clearer copy.',
  ai_gateway_error:
    'Extraction failed due to a processing error. Our team has been notified — try again in a few minutes.',
  schema_validation_failed:
    'Extraction returned an unexpected result and could not be processed. This has been flagged for review.',
  zero_units_extracted:
    'No unit rows could be identified in this document. Confirm this is a standard rent roll format, or contact support if it should have parsed.',
  zero_data_extracted:
    'No usable financial entries could be identified in this operating statement. Confirm this is a standard T-12 format, or contact support if it should have parsed.',
};

export function DiligenceGapsPanel({ extraction, onRetry }: DiligenceGapsPanelProps) {
  if (!extraction) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        No extraction has been run for this document yet.
      </div>
    );
  }

  // --- Hard failure state ----------------------------------------------------
  if (extraction.status === 'failed') {
    const reason = extraction.failureDetailJson?.reason || 'ai_gateway_error';
    const message = FAILURE_MESSAGES[reason] || FAILURE_MESSAGES.ai_gateway_error;
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="font-medium">Extraction failed</p>
            <p className="mt-0.5 text-red-700">{message}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 rounded border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Retry extraction
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Completed, but check for partial gaps ---------------------------------
  const missingItems = extraction.missingItemsJson ?? [];
  const lowConfidenceUnits = (extraction.confidenceJson?.lowConfidenceUnits ?? []).filter(Boolean);
  const aggregateConfidence = extraction.confidenceJson?.documentAggregateConfidence ?? 1.0;
  const reconciliation = extraction.confidenceJson?.reconciliation;
  const hasReconciliationDiscrepancy = reconciliation?.status === 'discrepancy';
  const hasGaps = missingItems.length > 0 || lowConfidenceUnits.length > 0 || hasReconciliationDiscrepancy;

  if (!hasGaps) {
    return null; // clean extraction — nothing to show, don't clutter the UI
  }

  const severity = aggregateConfidence < 0.5 || hasReconciliationDiscrepancy ? 'high' : 'moderate';

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div
      className={`rounded-md border px-3 py-3 text-sm ${
        severity === 'high'
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            severity === 'high' ? 'text-amber-600' : 'text-slate-400'
          }`}
        />
        <div className="flex-1">
          <p className="font-medium">
            Diligence gaps found ({Math.round(aggregateConfidence * 100)}% overall confidence)
          </p>

          {hasReconciliationDiscrepancy && reconciliation && (
            <div className="mt-2 rounded bg-white px-2 py-1.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20 font-mono">
              <strong>NOI Discrepancy:</strong> Document reports{' '}
              {formatCurrency(reconciliation.reportedNOI)}
              , but line items sum to{' '}
              {formatCurrency(reconciliation.computedNOI)}
              {' '}({((reconciliation.deltaPct ?? 0) * 100).toFixed(1)}% difference).
            </div>
          )}

          {lowConfidenceUnits.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                Units needing review
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {lowConfidenceUnits.map((unitNumber) => (
                  <span
                    key={unitNumber}
                    className="flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-current/20"
                  >
                    <AlertCircle className="h-3 w-3" />
                    Unit {unitNumber}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingItems.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                Missing fields
              </p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {missingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
