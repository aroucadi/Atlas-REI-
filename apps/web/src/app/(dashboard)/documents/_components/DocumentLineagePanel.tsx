'use client';

import { useState, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  LineageProvider,
  CitableField,
  PdfPageWithOverlays,
  SourceSpan,
} from './InteractiveLineage';
import { AlertCircle } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface RentRollFieldValue<T> {
  value: T | null;
  spanId: string | null;
}

interface RentRollUnit {
  unitNumber: RentRollFieldValue<string>;
  unitType: RentRollFieldValue<string>;
  bedrooms: RentRollFieldValue<number>;
  bathrooms: RentRollFieldValue<number>;
  tenantName: RentRollFieldValue<string>;
  monthlyBaseRent: RentRollFieldValue<number>;
  leaseStartDate: RentRollFieldValue<string>;
  leaseEndDate: RentRollFieldValue<string>;
  pastDueBalance: RentRollFieldValue<number>;
  rowConfidence: number;
}

interface DocumentExtraction {
  id: string;
  fieldsJson: {
    units: RentRollUnit[];
    propertyName: RentRollFieldValue<string>;
  };
  sourceSpansJson: SourceSpan[];
  confidenceJson: {
    documentAggregateConfidence: number;
    lowConfidenceUnits: (string | null)[];
  };
  missingItemsJson: string[];
}

interface DocumentLineagePanelProps {
  workspaceId: string;
  documentId: string;
  pdfUrl: string;
  extraction: DocumentExtraction;
}

function findSpan(spans: SourceSpan[], spanId: string | null): SourceSpan | null {
  if (!spanId) return null;
  return spans.find((s) => s.id === spanId) ?? null;
}

export function DocumentLineagePanel({
  pdfUrl,
  extraction,
}: DocumentLineagePanelProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageDimensions, setPageDimensions] = useState<
    Map<number, { width: number; height: number }>
  >(new Map());

  const spansByPage = useMemo(() => {
    const map = new Map<number, SourceSpan[]>();
    for (const span of extraction.sourceSpansJson || []) {
      const list = map.get(span.page) ?? [];
      list.push(span);
      map.set(span.page, list);
    }
    return map;
  }, [extraction.sourceSpansJson]);

  const handlePageRenderSuccess = (page: number, width: number, height: number) => {
    setPageDimensions((prev) => new Map(prev).set(page, { width, height }));
  };

  return (
    <LineageProvider>
      <div className="grid h-full grid-cols-2 gap-4 overflow-hidden">
        {/* Left pane: extracted fields */}
        <div className="overflow-y-auto rounded-md border border-slate-200 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            {extraction.fieldsJson?.propertyName?.value ?? 'Rent Roll'}
          </h3>

          {(extraction.fieldsJson?.units || []).map((unit) => (
            <div
              key={unit.unitNumber?.value ?? Math.random()}
              className="mb-3 rounded border border-slate-100 p-2"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Unit {unit.unitNumber?.value ?? '—'}
                </span>
                {unit.rowConfidence < 0.7 && (
                  <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    <AlertCircle className="h-3 w-3" />
                    Needs review
                  </span>
                )}
              </div>

              <CitableField
                label="Tenant"
                value={unit.tenantName?.value}
                span={findSpan(extraction.sourceSpansJson, unit.tenantName?.spanId)}
              />
              <CitableField
                label="Base Rent"
                value={unit.monthlyBaseRent?.value}
                span={findSpan(extraction.sourceSpansJson, unit.monthlyBaseRent?.spanId)}
              />
              <CitableField
                label="Lease Start"
                value={unit.leaseStartDate?.value}
                span={findSpan(extraction.sourceSpansJson, unit.leaseStartDate?.spanId)}
              />
              <CitableField
                label="Lease End"
                value={unit.leaseEndDate?.value}
                span={findSpan(extraction.sourceSpansJson, unit.leaseEndDate?.spanId)}
              />
              <CitableField
                label="Past Due"
                value={unit.pastDueBalance?.value}
                span={findSpan(extraction.sourceSpansJson, unit.pastDueBalance?.spanId)}
              />
            </div>
          ))}
        </div>

        {/* Right pane: PDF viewer overlays */}
        <div className="overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages }: { numPages: number }) => setNumPages(numPages)}
            loading={<div className="p-4 text-sm text-slate-500">Loading document…</div>}
            error={<div className="p-4 text-sm text-red-600">Failed to load document preview.</div>}
          >
            {numPages &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
                const dims = pageDimensions.get(pageNum);
                return (
                  <div key={pageNum} className="mb-3">
                    <PdfPageWithOverlays
                      page={pageNum}
                      pageWidthPx={dims?.width ?? 0}
                      pageHeightPx={dims?.height ?? 0}
                      spans={spansByPage.get(pageNum) ?? []}
                    >
                      <Page
                        pageNumber={pageNum}
                        width={600}
                        onRenderSuccess={(page: any) =>
                          handlePageRenderSuccess(pageNum, page.width, page.height)
                        }
                      />
                    </PdfPageWithOverlays>
                  </div>
                );
              })}
          </Document>
        </div>
      </div>
    </LineageProvider>
  );
}
