'use client';

import { useState } from 'react';
import { Download, Loader2, AlertTriangle } from 'lucide-react';

interface ExportUnderwriteButtonProps {
  workspaceId: string;
  underwriteRunId: string;
  propertyName?: string;
}

type ExportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string };

function resolveFileName(
  contentDisposition: string | null,
  fallbackPropertyName?: string,
): string {
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (match?.[1]) return match[1];
  }
  const safeName = (fallbackPropertyName ?? 'underwrite')
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase();
  return `${safeName}_underwrite.xlsx`;
}

async function downloadUnderwriteExport(
  workspaceId: string,
  underwriteRunId: string,
  fallbackPropertyName?: string,
): Promise<void> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/underwrites/${underwriteRunId}/export`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.message ?? `Export failed with status ${res.status}`,
    );
  }

  const blob = await res.blob();
  const fileName = resolveFileName(
    res.headers.get('Content-Disposition'),
    fallbackPropertyName,
  );

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export function ExportUnderwriteButton({
  workspaceId,
  underwriteRunId,
  propertyName,
}: ExportUnderwriteButtonProps) {
  const [state, setState] = useState<ExportState>({ status: 'idle' });

  const handleExport = async () => {
    setState({ status: 'loading' });
    try {
      await downloadUnderwriteExport(workspaceId, underwriteRunId, propertyName);
      setState({ status: 'idle' });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Export failed',
      });
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleExport}
        disabled={state.status === 'loading'}
        className="inline-flex items-center gap-2 rounded-md border border-amber-300
                   bg-gradient-to-b from-amber-50 to-amber-100 px-4 py-2
                   text-sm font-semibold text-amber-900 shadow-sm transition-colors
                   hover:from-amber-100 hover:to-amber-200
                   disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.status === 'loading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing workbook…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Export Underwriting to Excel
          </>
        )}
      </button>

      {state.status === 'error' && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {state.message}
        </div>
      )}
    </div>
  );
}
