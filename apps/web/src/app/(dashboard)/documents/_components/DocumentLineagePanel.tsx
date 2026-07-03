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
  fieldsJson: any;
  sourceSpansJson: SourceSpan[];
  confidenceJson: any;
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

function sumMonthly(monthlyValues: (number | null)[] | undefined): number {
  if (!monthlyValues) return 0;
  return monthlyValues.reduce((sum: number, v) => sum + (v ?? 0), 0);
}

function formatCurrency(val: number | null | undefined) {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
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
          <h3 className="mb-3 text-sm font-semibold text-slate-900 border-b pb-2">
            {extraction.fieldsJson?.propertyName?.value || extraction.fieldsJson?.propertyName || 'Diligence Extraction'}
          </h3>

          {extraction.fieldsJson?.units ? (
            /* --- RENT ROLL UNIT LIST --- */
            (extraction.fieldsJson.units as RentRollUnit[]).map((unit) => (
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
            ))
          ) : (
            /* --- T-12 OPERATING STATEMENT --- */
            <div className="space-y-4 font-mono text-xs">
              <div>
                <h4 className="text-xs font-bold text-slate-900 border-b pb-1 uppercase tracking-wider mb-2">INCOME</h4>
                <div className="space-y-2">
                  <CitableField
                    label="Gross Potential Rent"
                    value={formatCurrency(extraction.fieldsJson?.income?.grossPotentialRent?.annualTotal || sumMonthly(extraction.fieldsJson?.income?.grossPotentialRent?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.income?.grossPotentialRent?.spanId)}
                  />
                  <CitableField
                    label="Physical Vacancy Loss"
                    value={formatCurrency(extraction.fieldsJson?.income?.physicalVacancyLoss?.annualTotal || sumMonthly(extraction.fieldsJson?.income?.physicalVacancyLoss?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.income?.physicalVacancyLoss?.spanId)}
                  />
                  <CitableField
                    label="Concessions"
                    value={formatCurrency(extraction.fieldsJson?.income?.concessionsLoss?.annualTotal || sumMonthly(extraction.fieldsJson?.income?.concessionsLoss?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.income?.concessionsLoss?.spanId)}
                  />
                  <CitableField
                    label="Bad Debt"
                    value={formatCurrency(extraction.fieldsJson?.income?.badDebtLoss?.annualTotal || sumMonthly(extraction.fieldsJson?.income?.badDebtLoss?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.income?.badDebtLoss?.spanId)}
                  />
                  <CitableField
                    label="Utility Chargeback Income"
                    value={formatCurrency(extraction.fieldsJson?.income?.utilityChargebackIncome?.annualTotal || sumMonthly(extraction.fieldsJson?.income?.utilityChargebackIncome?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.income?.utilityChargebackIncome?.spanId)}
                  />
                  {(extraction.fieldsJson?.income?.otherAncillaryIncome || []).map((item: any, idx: number) => (
                    <CitableField
                      key={idx}
                      label={item.category || 'Other Income'}
                      value={formatCurrency(item.monthlyValues?.annualTotal || sumMonthly(item.monthlyValues?.monthlyValues))}
                      span={findSpan(extraction.sourceSpansJson, item.monthlyValues?.spanId)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 border-b pb-1 uppercase tracking-wider mb-2">EXPENSES</h4>
                <div className="space-y-2">
                  <CitableField
                    label="Property Taxes"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.propertyTaxes?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.propertyTaxes?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.propertyTaxes?.spanId)}
                  />
                  <CitableField
                    label="Insurance"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.insurance?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.insurance?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.insurance?.spanId)}
                  />
                  <CitableField
                    label="Repairs & Maintenance"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.repairsAndMaintenance?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.repairsAndMaintenance?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.repairsAndMaintenance?.spanId)}
                  />
                  <CitableField
                    label="Utilities (Owner-Paid)"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.utilities?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.utilities?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.utilities?.spanId)}
                  />
                  <CitableField
                    label="Management Fees"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.managementFees?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.managementFees?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.managementFees?.spanId)}
                  />
                  <CitableField
                    label="Advertising & Marketing"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.advertisingAndMarketing?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.advertisingAndMarketing?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.advertisingAndMarketing?.spanId)}
                  />
                  <CitableField
                    label="Administrative"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.administrativeCosts?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.administrativeCosts?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.administrativeCosts?.spanId)}
                  />
                  <CitableField
                    label="Payroll & Benefits"
                    value={formatCurrency(extraction.fieldsJson?.expenses?.payrollAndBenefits?.annualTotal || sumMonthly(extraction.fieldsJson?.expenses?.payrollAndBenefits?.monthlyValues))}
                    span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.expenses?.payrollAndBenefits?.spanId)}
                  />
                  {(extraction.fieldsJson?.expenses?.otherExpenses || []).map((item: any, idx: number) => (
                    <CitableField
                      key={idx}
                      label={item.category || 'Other Expense'}
                      value={formatCurrency(item.monthlyValues?.annualTotal || sumMonthly(item.monthlyValues?.monthlyValues))}
                      span={findSpan(extraction.sourceSpansJson, item.monthlyValues?.spanId)}
                    />
                  ))}
                </div>
              </div>

              {extraction.fieldsJson?.reportedTotals && (
                <div>
                  <h4 className="text-xs font-bold text-slate-900 border-b pb-1 uppercase tracking-wider mb-2">REPORTED TOTALS</h4>
                  <div className="space-y-2">
                    <CitableField
                      label="Reported Gross Revenue"
                      value={formatCurrency(extraction.fieldsJson?.reportedTotals?.totalGrossRevenue?.value)}
                      span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.reportedTotals?.totalGrossRevenue?.spanId)}
                    />
                    <CitableField
                      label="Reported Operating Expenses"
                      value={formatCurrency(extraction.fieldsJson?.reportedTotals?.totalOperatingExpenses?.value)}
                      span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.reportedTotals?.totalOperatingExpenses?.spanId)}
                    />
                    <CitableField
                      label="Reported Net Operating Income"
                      value={formatCurrency(extraction.fieldsJson?.reportedTotals?.netOperatingIncome?.value)}
                      span={findSpan(extraction.sourceSpansJson, extraction.fieldsJson?.reportedTotals?.netOperatingIncome?.spanId)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
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
